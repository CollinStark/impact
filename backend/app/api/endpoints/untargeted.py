import io
import json
import logging
import os
import uuid
from typing import List, Optional

import chardet
import pandas as pd
from app.components.calculation import run_mid_calculation
from app.components.network import Network
from app.components.r_scripts import run_isotope_detection, run_lcms_preprocessing
from app.components.utils import process_csv_file, read_csv_file
from app.core.config import settings
from app.manager import manager
from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import FileResponse, JSONResponse

logger = logging.getLogger(__name__)

# API router for defining endpoints related to untargeted functionality
router = APIRouter()

# Constant: Directory to store the uploaded files on the server
UPLOADS_DIR = "../uploads"


@router.post("/preprocessing")
async def preprocessing(
    files: List[UploadFile] = File(...), meta: str = Form("")
) -> JSONResponse:
    """Preprocessing endpoint to handle uploaded files.

    This endpoint accepts a list of files, separates metadata files from other files,
    and organizes them into session-specific directories.

    Args:
        files (List[UploadFile]): List of uploaded files.
        meta (str): JSON string containing group metadata.

    Returns:
        JSONResponse: Response containing details of the preprocessing.
    """

    logger.info(f"Request: POST /api/untargeted/preprocessing")
    session_id = str(uuid.uuid4())
    logging.info(f"Generated session ID: {session_id}")

    # Create a directory for the session
    session_dir = os.path.join(UPLOADS_DIR, session_id)
    data_dir = os.path.join(session_dir, "data")
    reference_dir = os.path.join(session_dir, "reference")
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(reference_dir, exist_ok=True)

    # Parse the meta JSON string into a dictionary
    try:
        metadata_groups = json.loads(meta) if meta else {}
    except json.JSONDecodeError as e:
        logging.error("Failed to parse metadata JSON string.", exc_info=e)
        return JSONResponse(
            status_code=400, content={"error": "Invalid metadata format"}
        )

    file_data = []
    # Process the uploaded files
    for file in files:
        if file.filename:
            file_group = metadata_groups.get(file.filename, "unknown")
            file_path = os.path.join(data_dir, file.filename)
            logging.info(f"Processing file: {file.filename}, Group: {file_group}")

            # Save the file
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)
                logging.info(f"Saved file: {file.filename} ({len(content)} bytes)")

            file_data.append({"file_name": file.filename, "group": file_group})

    # Convert the list to a DataFrame
    file_info_df = pd.DataFrame(file_data)

    # Save the DataFrame as a CSV in session_dir
    csv_file_path = os.path.join(reference_dir, "file_info.csv")
    file_info_df.to_csv(csv_file_path, index=False)

    # Return the session ID as a JSON response
    return JSONResponse(content={"session_id": session_id})


@router.post("/preprocessing/params")
async def set_preprocessing_params(
    libraryFile: UploadFile = File(None),
    ms2Files: List[UploadFile] = File(None),
    jsonString: str = Form(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> JSONResponse:
    data = json.loads(jsonString)
    session_id = data.get("sessionId")

    logger.info(f"Request: POST /api/untargeted/preprocessing/params ID: {session_id}")

    logger.info(f"Received request parameters: {jsonString}")

    manager.start_session(session_id)
    manager.update_session_object(session_id, "preprocessing", "waiting")
    manager.send_session_object(session_id)
    manager.send_message(session_id, f"0/7 Received Request ({session_id})")

    session_dir = os.path.join(UPLOADS_DIR, session_id)
    data_dir = os.path.join(session_dir, "data")
    reference_dir = os.path.join(session_dir, "reference")
    reference_path = os.path.join(reference_dir, "file_info.csv")

    if not os.listdir(data_dir) or not os.path.exists(reference_path):
        logging.error(f"No files found in data directory for session: {session_id}")
        manager.send_message(session_id, "Error: No raw files found for that job!")
        return JSONResponse(content={"error": "No files found in data directory"})

    # Initialize the boolean variables
    has_ms2_files = False
    has_library_file = False

    # Process and save the library file
    library_file_path = ""
    if libraryFile:
        logging.info(f"Processing library file for session: {session_id}")
        manager.send_message(session_id, f"0/7 Starting Library Preparation")
        library_dir = os.path.join(UPLOADS_DIR, session_id, "library")
        os.makedirs(library_dir, exist_ok=True)
        library_file_path = os.path.join(library_dir, libraryFile.filename)

        with open(library_file_path, "wb") as file_out:
            content = await libraryFile.read()
            file_out.write(content)
            logging.info(
                f"Library file saved: {library_file_path} ({len(content)} bytes)"
            )
        data["libraryFile"] = library_file_path
        has_library_file = True

    # Process and save MS2 files
    ms2_dir = os.path.join(UPLOADS_DIR, session_id, "ms2")
    if ms2Files:
        logging.info(f"Starting MS2 File Preparation for session: {session_id}")
        manager.send_message(session_id, f"0/7 Starting MS2 File Preparation")
        os.makedirs(ms2_dir, exist_ok=True)

        for file in ms2Files:
            if file.filename:
                file_path = os.path.join(ms2_dir, file.filename)
                with open(file_path, "wb") as file_out:
                    content = await file.read()
                    file_out.write(content)
                    logging.info(f"MS2 file saved: {file_path} ({len(content)} bytes)")
        data["ms2Files"] = [
            os.path.join(ms2_dir, file.filename) for file in ms2Files if file.filename
        ]
        has_ms2_files = True

    results_dir = os.path.join(session_dir, "results")
    os.makedirs(results_dir, exist_ok=True)

    logging.info(
        f"Initiating background task for preprocessing with session ID: {session_id}"
    )

    background_tasks.add_task(
        preprocessing_task,
        session_id,
        data_dir,
        reference_path,
        results_dir,
        settings.CORE_COUNT,
        settings.MULTI_CORE,
        data["peakPickingParams"],
        data["peakGroupParams"],
        data["peakAlignmentParams"],
        data["ms1AnnotationParams"],
        has_library_file,
        library_file_path,
        data["libraryAnnotationParams"],
        has_ms2_files,
        ms2_dir,
        data["ms2AnnotationParams"],
    )

    return JSONResponse(content={"session_id": session_id})


def preprocessing_task(
    session_id,
    file_directory,
    reference_file,
    output_folder,
    chunks,
    multicore,
    cent_params,
    pdp_params,
    pgp_params,
    ms1_params,
    is_library,
    ms1_library,
    ms1_library_params,
    is_ms2,
    ms2_directory,
    ms2_params,
):
    try:
        logger.info(f"/preprocessing Start LCMS preprocessing ({session_id})")
        manager.send_message(session_id, "1/7 Starting LC-MS Preprocessing")
        run_lcms_preprocessing(
            session_id,
            manager,
            file_directory,
            reference_file,
            output_folder,
            chunks,
            multicore,
            cent_params,
            pdp_params,
            pgp_params,
            ms1_params,
            is_library,
            ms1_library,
            ms1_library_params,
            is_ms2,
            ms2_directory,
            ms2_params,
        )

        manager.send_message(session_id, "7/7 Finished LC-MS Preprocessing")
        manager.update_session_object(session_id, "preprocessing", "done")
        manager.send_session_object(session_id)

        logger.info(f"Finished processing request to /preprocessing ({session_id})")
    except Exception as e:
        error_message = str(e)
        logger.error(
            f"Error in preprocessing task for session {session_id}: {error_message}"
        )
        manager.send_message(session_id, f"Error: {error_message}")
        manager.update_session_object(session_id, "preprocessing", "error")
        manager.send_session_object(session_id)


@router.post("/contextualization")
async def contextualization(
    csvFile: UploadFile,
    pathwayFile: UploadFile = File(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    sumThreshold: float = Form(...),
    minLabel: float = Form(...),
    minCarbon: float = Form(...),
    minQuant: float = Form(...),
    m0Threshold: float = Form(...),
    excludedConditions: List[str] = Form(...),
    unlabeledConditions: List[str] = Form(...),
    sessionId: Optional[str] = Form(None),
) -> JSONResponse:

    if sessionId:
        session_id = sessionId
    else:
        session_id = str(uuid.uuid4())

    session_dir = os.path.join(UPLOADS_DIR, session_id)
    context_dir = os.path.join(session_dir, "context")
    os.makedirs(context_dir, exist_ok=True)
    manager.start_session(session_id)
    manager.update_session_object(session_id, "context", "waiting")
    manager.send_session_object(session_id)
    manager.send_message(session_id, f"0/2 Received Request ({session_id})")
    manager.send_message(session_id, f"0/2 Preparing Files")

    try:
        contents = await csvFile.read()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="There was an error uploading the file.",
        )

    # Decode the file contents using detected encoding
    detected_encoding = chardet.detect(contents)
    file_encoding = detected_encoding["encoding"]

    # Check if the detected file encoding is None
    if file_encoding is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unable to detect file encoding.",
        )

    decoded_contents = contents.decode(file_encoding)

    # Convert the decoded contents to a Pandas DataFrame
    file_io = io.StringIO(decoded_contents)
    df = pd.read_csv(file_io)

    # Validate required columns
    required_columns = [
        "name",
        "compound_id",
        "mass_isotopomer",
        "mids",
        "cis",
        "intensity_mean",
        "intensity_se",
        "mz",
        "rt",
        "experiment",
        "condition",
    ]
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Missing required columns: {', '.join(missing_columns)}.",
        )

    pathway_data = {}
    if pathwayFile:
        try:
            pathway_contents = await pathwayFile.read()
            pathway_encoding = chardet.detect(pathway_contents)["encoding"]
            if pathway_encoding is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Unable to detect file encoding for pathway file.",
                )
            decoded_pathway_contents = pathway_contents.decode(pathway_encoding)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="There was an error uploading the pathway file.",
            )

        # Parse the JSON data
        try:
            pathway_data = json.loads(decoded_pathway_contents)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Error parsing the pathway file. Ensure it is valid JSON.",
            )

    background_tasks.add_task(
        context_task,
        session_id,
        context_dir,
        df,
        pathway_data,
        sumThreshold,
        minLabel,
        minCarbon,
        minQuant,
        m0Threshold,
        excludedConditions,
        unlabeledConditions,
    )

    return JSONResponse(content={"session_id": session_id})


def context_task(
    session_id,
    context_dir,
    df,
    pathway_data,
    sumThreshold,
    minLabel,
    minCarbon,
    minQuant,
    m0Threshold,
    excludedConditions,
    unlabeledConditions,
):

    try:
        net = Network(
            sumThreshold,
            minLabel,
            minCarbon,
            excludedConditions,
            minQuant,
            m0Threshold,
            unlabeledConditions,
        )

        manager.send_message(session_id, f"0/2 Setting up Network")
        net.read_pd(df)
        if pathway_data:
            manager.send_message(session_id, f"0/2 Setting up Pathway")
            net.read_pathway(pathway_data)

        manager.send_message(session_id, f"1/2 Calculating Contextualization")
        net.setup_connections(settings.CORE_COUNT, manager, session_id)

        json_data = net.get_json()

        # Save json_data to context_dir
        file_path = os.path.join(context_dir, "network_graph.json")
        with open(file_path, "w") as file:
            json.dump(json_data, file)

        manager.send_message(session_id, f"2/2 Finished Contextualization")
        manager.update_session_object(session_id, "context", "done")
        manager.send_session_object(session_id)
    except Exception as e:
        error_message = str(e)
        logger.error(
            f"Error in contextualization task for session {session_id}: {error_message}"
        )
        manager.send_message(session_id, f"Error: {error_message}")
        manager.update_session_object(session_id, "context", "error")
        manager.send_session_object(session_id)


@router.get("/mid-calculation/{session_id}")
async def get_mid_data(session_id: str):
    session_dir = os.path.join(UPLOADS_DIR, session_id, "mids")

    if os.path.exists(session_dir):
        file_names = os.listdir(session_dir)
        return JSONResponse(content={"session_id": session_id, "files": file_names})
    else:
        raise HTTPException(status_code=404, detail="Invalid session_id")


@router.get("/session/{session_id}/is_active")
async def is_session_active(session_id: str):
    is_active = manager.is_session_initiated(session_id)
    return {"active": is_active}


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(session_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(session_id)


@router.post("/calculation-upload")
async def calculation_upload(
    background_tasks: BackgroundTasks,
    rtWindow: float = Form(...),
    ppm: float = Form(...),
    noiseCutoff: float = Form(...),
    alpha: float = Form(...),
    enrichTol: float = Form(...),
    intFile: Optional[UploadFile] = File(None),
    peakFile: Optional[UploadFile] = File(None),
    groupFile: UploadFile = File(...),
    minFraction: float = Form(...),
    sumThreshold: float = Form(...),
    minLabel: float = Form(...),
    maxLabel: float = Form(...),
    formulaTrail: bool = Form(...),
    sessionId: Optional[str] = Form(None),
    ctrlCondition: Optional[str] = Form(None),
) -> JSONResponse:

    if sessionId:
        session_id = sessionId
    else:
        session_id = str(uuid.uuid4())

    manager.start_session(session_id)
    manager.update_session_object(session_id, "calculation", "waiting")
    manager.send_session_object(session_id)
    manager.send_message(session_id, f"0/3 Received Request ({session_id})")
    logger.info(f"Received a request to /calculation-upload ({session_id})")
    manager.send_message(
        session_id,
        f"0/3 Isotope Detection Parameters: rtWindow = {rtWindow}, ppm = {ppm}, noiseCutoff = {noiseCutoff}, alpha = {alpha}, enrichTol = {enrichTol}",
    )
    manager.send_message(
        session_id,
        f"0/3 MID Calculation Parameters: minFraction = {minFraction}, sumThreshold = {sumThreshold}, minLabel = {minLabel}, maxLabel = {maxLabel}, formulaTrail = {formulaTrail}",
    )
    logger.info(
        f"0/3 Isotope Detection Parameters: rtWindow = {rtWindow}, ppm = {ppm}, noiseCutoff = {noiseCutoff}, alpha = {alpha}, enrichTol = {enrichTol}"
    )
    logger.info(
        f"0/3 MID Calculation Parameters: minFraction = {minFraction}, sumThreshold = {sumThreshold}, minLabel = {minLabel}, maxLabel = {maxLabel}, formulaTrail = {formulaTrail}"
    )
    manager.send_message(session_id, f"0/3 Preparing Data")
    # Create a directory for the session
    session_dir = os.path.join(UPLOADS_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)
    mid_dir = os.path.join(session_dir, "mids")
    os.makedirs(mid_dir, exist_ok=True)
    file_path = os.path.join(mid_dir, "isotopes.csv")

    if intFile:
        int_data = await process_csv_file(intFile)
    else:
        int_file_path = os.path.join(session_dir, "results", "feature_intensities.csv")
        int_data = read_csv_file(int_file_path)

    if peakFile:
        peak_data = await process_csv_file(peakFile)
        required_columns = ["rtmed", "mzmed", "name", "id", "formula"]

        missing_columns = [
            col for col in required_columns if col not in peak_data.columns
        ]
        if missing_columns:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Missing required columns in Annotation File: {', '.join(missing_columns)}.",
            )
    else:
        peak_file_path = os.path.join(session_dir, "results", "feature_annotation.csv")
        peak_data = read_csv_file(peak_file_path)

    group_data = await process_csv_file(groupFile)

    # Validate required columns
    required_columns = [
        "labeling",
        "experiment",
        "condition",
        "file_name",
    ]

    missing_columns = [col for col in required_columns if col not in group_data.columns]
    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Missing required columns in Sample File: {', '.join(missing_columns)}.",
        )

    file_names = int_data.columns

    missing_file_names = [
        file_name
        for file_name in file_names
        if file_name not in group_data["file_name"].values
    ]

    if missing_file_names:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"The following file names are present in the Feature Intensity file but missing in the Group Data file: {missing_file_names}",
        )

    group_data = group_data[group_data["file_name"].isin(file_names)]
    order_mapping = {file_name: i for i, file_name in enumerate(file_names)}
    group_data["_sort_order"] = group_data["file_name"].map(order_mapping)
    group_data = group_data.sort_values(by="_sort_order").drop(columns=["_sort_order"])
    labeling_data = list(group_data["labeling"])

    background_tasks.add_task(
        long_running_task,
        session_id,
        int_data,
        peak_data,
        labeling_data,
        rtWindow,
        ppm,
        noiseCutoff,
        alpha,
        enrichTol,
        file_path,
        group_data,
        mid_dir,
        sumThreshold,
        minLabel,
        minFraction,
        maxLabel,
        formulaTrail,
        ctrlCondition,
    )

    logger.info(f"Return request /calculation-upload ({session_id})")
    return JSONResponse(content={"session_id": session_id})


def long_running_task(
    session_id,
    int_data,
    peak_data,
    labeling_data,
    rtWindow,
    ppm,
    noiseCutoff,
    alpha,
    enrichTol,
    file_path,
    group_data,
    mid_dir,
    sumThreshold,
    minLabel,
    minFraction,
    maxLabel,
    formulaTrail,
    ctrl_condition,
):
    try:
        logger.info(f"/calculation-upload Start isotope detection ({session_id})")
        manager.send_message(session_id, "1/3 Starting Isotope Detection")
        run_isotope_detection(
            int_data,
            peak_data,
            labeling_data,
            rtWindow,
            ppm,
            noiseCutoff,
            alpha,
            enrichTol,
            file_path,
        )
        manager.send_message(session_id, "1/3 Finished Isotope Detection")
        logger.info(f"/calculation-upload Start mid calculation ({session_id})")
        manager.send_message(session_id, "2/3 Starting MID Calculation")
        print(settings.CORE_COUNT)
        run_mid_calculation(
            file_path,
            group_data,
            mid_dir,
            sumThreshold,
            minLabel,
            minFraction,
            maxLabel,
            formulaTrail,
            settings.CORE_COUNT,
            manager,
            session_id,
            ctrl_condition,
        )
        manager.send_message(session_id, "3/3 Finished MID Calculation")
        manager.update_session_object(session_id, "calculation", "done")
        manager.send_session_object(session_id)

        logger.info(
            f"Finished processing request to /calculation-upload ({session_id})"
        )
    except Exception as e:
        error_message = str(e)
        logger.error(
            f"Error in contextualization task for session {session_id}: {error_message}"
        )
        manager.send_message(session_id, f"Error: {error_message}")
        manager.update_session_object(session_id, "context", "error")
        manager.send_session_object(session_id)


@router.get("/contextualization/download/{session_id}")
async def download_context_file(session_id: str):
    # Construct the file path using session_id and filename
    file_path = os.path.join(UPLOADS_DIR, session_id, "context", "network_graph.json")

    # Check if the file exists
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path, filename="network_graph.json", media_type="application/json"
    )


@router.get("/mid-calculation/download/{session_id}/{filename}")
async def download_mid_file(session_id: str, filename: str):
    # Construct the file path using session_id and filename
    file_path = os.path.join(UPLOADS_DIR, session_id, "mids", filename)

    # Check if the file exists
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path=file_path, filename=filename, media_type="text/csv")


@router.get("/preprocessing/download/{session_id}/{filename}")
async def download_preprocessing_file(session_id: str, filename: str):
    # Construct the file path using session_id and filename
    file_path = os.path.join(UPLOADS_DIR, session_id, "results", filename)

    # Check if the file exists
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path=file_path, filename=filename, media_type="text/csv")


@router.get("/download/{session_id}/{step}/{filename}")
async def download_file(session_id: str, step: str, filename: str):
    # Construct the file path using session_id and filename
    file_path = os.path.join(UPLOADS_DIR, session_id, step, filename)

    # Check if the file exists
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path=file_path, filename=filename, media_type="text/csv")
