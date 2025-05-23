import json
import multiprocessing
import secrets
from typing import List, Union

from pydantic import AnyHttpUrl, HttpUrl, validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    API_STR: str = "/api"
    SECRET_KEY: str = secrets.token_urlsafe(32)
    # 60 minutes * 24 hours * 8 days = 8 days
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    SERVER_NAME: str = "impact-backend"
    SERVER_HOST: AnyHttpUrl = HttpUrl("http://localhost:8000")
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost",
        "http://localhost:3000",
    ]

    @validator("CORE_COUNT")
    def check_core_count(cls, v):
        min_cores = 1
        max_cores = max(multiprocessing.cpu_count() - 2, min_cores)
        if v < min_cores:
            raise ValueError(f"CORE_COUNT cannot be less than {min_cores}")
        if v > max_cores:
            raise ValueError(f"CORE_COUNT cannot be greater than {max_cores}")
        return v

    CORE_COUNT: int = max(
        multiprocessing.cpu_count() - 2, 1
    )  # Set to cpu_count() - 2, or 1 if cpu_count() - 2 is less than 1

    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    PROJECT_NAME: str = "IMPACT Backend"
    MULTI_CORE: bool = True

    class Config:
        case_sensitive = True


def load_settings_from_json(filename: str):
    with open(filename, "r") as file:
        data = json.load(file)
    return Settings(**data)


settings = load_settings_from_json("app/config.json")
