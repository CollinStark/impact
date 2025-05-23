from fastapi.testclient import TestClient
from app.main import app  # Import your FastAPI app instance

client = TestClient(app)


def test_preprocessing_endpoint():
    # Define the files to be uploaded, including different file types
    files = [
        ("files", ("file.mzXML", "content of mzXML file", "application/octet-stream")),
        ("files", ("file.mzML", "content of mzML file", "application/octet-stream")),
        (
            "files",
            ("file.mzData", "content of mzData file", "application/octet-stream"),
        ),
        ("files", ("metadata.json", '{"key": "value"}', "application/json")),
    ]

    # Make a POST request to the preprocessing endpoint
    response = client.post("/api/untargeted/preprocessing", files=files)

    # Validate the response status code and content
    assert response.status_code == 200
    assert "session_id" in response.json()
