from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_contextualization():
    # Path to your CSV file
    file_path = "test_data/context/data_for_strain_2441.csv"

    # Making a simulated API call
    with open(file_path, "rb") as file:
        response = client.post(
            "/api/untargeted/contextualization", files={"file": file}
        )

    # Validate the response
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"

    data = response.json()

    # Validate the response structure
    assert "nodes" in data
    assert "edges" in data

    # Validate nodes and edges content
    assert isinstance(data["nodes"], list)
    assert isinstance(data["edges"], list)

    print(data["nodes"])

    # for node in data["nodes"]:
    #     # As an example, check if each node has an 'id' property
    #     assert "id" in node

    # for edge in data["edges"]:
    #     # As an example, check if each edge has 'source' and 'target' properties
    #     assert "source" in edge
    #     assert "target" in edge

    print(data["edges"])
    # Add any other assertions based on expected response content or structure
