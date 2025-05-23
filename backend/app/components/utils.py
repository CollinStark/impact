import io
import os

import chardet
import pandas as pd
from fastapi import HTTPException, UploadFile, status
from pandas import DataFrame


async def process_csv_file(file: UploadFile) -> DataFrame:
    content = await file.read()

    detected_encoding = chardet.detect(content)
    file_encoding = detected_encoding["encoding"]

    if file_encoding is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unable to detect file encoding.",
        )

    decoded_contents = content.decode(file_encoding)
    content_io = io.StringIO(decoded_contents)

    return pd.read_csv(content_io)


def read_csv_file(file_path: str) -> DataFrame:
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    return pd.read_csv(file_path)


class UserInputError(Exception):
    """Exception raised for errors in the user input."""

    pass
