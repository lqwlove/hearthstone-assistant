from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import assistant, auth, cards, decks, skills
from app.config import get_settings
from app.database import Base, engine
from app.services.deck_agent import ensure_agent_memory_ready, shutdown_agent_memory

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_agent_memory_ready(settings)
    yield
    shutdown_agent_memory()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(cards.router, prefix="/api")
app.include_router(decks.router, prefix="/api")
app.include_router(assistant.router, prefix="/api")
app.include_router(skills.router, prefix="/api")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
