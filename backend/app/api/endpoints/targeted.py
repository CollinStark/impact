import csv
import io
from typing import Dict, List

import chardet
import pandas as pd

# Import the mid_calculation function from your components.targeted module
from app.components.targeted_calculation import calculate_mid, mid_calculation
from app.components.utils import UserInputError
from fastapi import APIRouter, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

router = APIRouter()


@router.post("/upload")
async def upload(
    file: UploadFile,
    ctrlCondition: str = Form(...),
):
    """
    Upload a TSV file, process it, and return the processed data as JSON.

    Parameters:
        file (UploadFile): The uploaded TSV file containing metabolite data.

    Returns:
        dict: A dictionary containing the filename and the processed data in JSON format.
            The processed data is a dictionary where each key represents a unique metabolite name,
            and the corresponding value is a list of dictionaries containing the timepoint,
            corrected value ('value'), and mass isotopomer ('isotopomer') for that metabolite.
            The dictionary has the following structure:

            {
                "Metabolite1": [
                    {
                        "timepoint": "T0",
                        "value": 123.45,
                        "isotopomer": "ParentMetabolite1"
                    },
                    {
                        "timepoint": "T1",
                        "value": 678.90,
                        "isotopomer": "ParentMetabolite1"
                    },
                    ...
                ],
                "Metabolite2": [
                    ...
                ],
                ...
            }

            Note: The values for 'timepoint' can be 'Ctrl' for control samples or None for invalid timepoints.

    Raises:
        HTTPException: If there was an error uploading the file or processing the data.
    """
    try:
        # Read the contents of the uploaded file
        contents = await file.read()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="There was an error uploading the file. The content could not be read.",
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

    # Sniff the delimiter
    sniffer = csv.Sniffer()
    sample = decoded_contents[:2000]  # Sample size can be adjusted
    dialect = sniffer.sniff(sample)
    delimiter = dialect.delimiter

    # Convert the decoded contents to a Pandas DataFrame
    file_io = io.StringIO(decoded_contents)
    df = pd.read_csv(file_io, delimiter=delimiter)

    try:
        # Process the data using the mid_calculation function
        json_data = calculate_mid(df, ctrlCondition)

    except UserInputError as ue:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ue),
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during data processing.",
        ) from e

    if not file.filename:
        filename = "unknown.csv"
    else:
        filename = file.filename

    return JSONResponse(content={"filename": filename, "data": json_data})
