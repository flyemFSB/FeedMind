from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.envelope import ApiEnvelope
from app.schemas.wiki import (
    WikiGraphResponse,
    WikiIngestJobRead,
    WikiIngestRequest,
    WikiIngestResult,
    WikiIngestJobUpdate,
    WikiPageRead,
    WikiPageSearchRead,
    WikiSourceCreate,
    WikiSourceDeleteImpact,
    WikiSourceDetailRead,
    WikiSourceRead,
    WikiSpaceRead,
)
from app.services import wiki_space_service
from app.services.wiki_space_service import (
    WikiJobCancelConflictError,
    WikiJobNotFoundError,
    WikiJobRetryConflictError,
    WikiSourceBusyError,
    WikiSourceNotFoundError,
    WikiSpaceNotFoundError,
)

router = APIRouter(prefix="/wiki-spaces", tags=["wiki-spaces"])


def _not_found(exc: Exception) -> HTTPException:
    """把 service 的不存在异常转换为统一 404 响应。"""
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)


@router.get("", response_model=ApiEnvelope[list[WikiSpaceRead]])
def list_wiki_spaces() -> ApiEnvelope[list[WikiSpaceRead]]:
    """返回 WIKI 空间列表（含页面汇总统计）。"""
    return ApiEnvelope(data=wiki_space_service.list_wiki_spaces())


@router.get("/{space_id}/pages", response_model=ApiEnvelope[list[WikiPageRead]])
def list_wiki_pages(space_id: str) -> ApiEnvelope[list[WikiPageRead]]:
    """返回某个 WIKI 空间下的页面列表（含关系数统计）。"""
    try:
        return ApiEnvelope(data=wiki_space_service.list_wiki_pages(space_id))
    except WikiSpaceNotFoundError as exc:
        raise _not_found(exc) from exc


@router.get("/{space_id}/search", response_model=ApiEnvelope[list[WikiPageSearchRead]])
def search_wiki_pages(
    space_id: str,
    q: str = Query(..., min_length=1),
) -> ApiEnvelope[list[WikiPageSearchRead]]:
    """按标题或 Markdown 正文做最小关键词搜索。"""
    try:
        return ApiEnvelope(data=wiki_space_service.search_wiki_pages(space_id, q))
    except WikiSpaceNotFoundError as exc:
        raise _not_found(exc) from exc


@router.get("/{space_id}/graph", response_model=ApiEnvelope[WikiGraphResponse])
def get_wiki_graph(space_id: str) -> ApiEnvelope[WikiGraphResponse]:
    """返回某个 WIKI 空间的知识图谱（不含 embedding 二进制数据）。"""
    try:
        return ApiEnvelope(data=wiki_space_service.get_wiki_graph(space_id))
    except WikiSpaceNotFoundError as exc:
        raise _not_found(exc) from exc


@router.get("/{space_id}/sources", response_model=ApiEnvelope[list[WikiSourceRead]])
def list_wiki_sources(space_id: str) -> ApiEnvelope[list[WikiSourceRead]]:
    """返回指定 WIKI 空间下的来源列表。"""
    try:
        return ApiEnvelope(data=wiki_space_service.list_wiki_sources(space_id))
    except WikiSpaceNotFoundError as exc:
        raise _not_found(exc) from exc


@router.post(
    "/{space_id}/sources",
    response_model=ApiEnvelope[WikiSourceRead],
    status_code=status.HTTP_201_CREATED,
)
def create_wiki_source(
    space_id: str,
    payload: WikiSourceCreate,
) -> ApiEnvelope[WikiSourceRead]:
    """创建一个待摄入的 WIKI 来源。"""
    try:
        return ApiEnvelope(data=wiki_space_service.create_wiki_source(space_id, payload))
    except WikiSpaceNotFoundError as exc:
        raise _not_found(exc) from exc


@router.post("/{space_id}/ingestions", response_model=ApiEnvelope[list[WikiIngestResult]])
def ingest_wiki_sources(
    space_id: str,
    payload: WikiIngestRequest,
) -> ApiEnvelope[list[WikiIngestResult]]:
    """统一摄入入口：source_ids 支持传入一个或多个来源。"""
    try:
        return ApiEnvelope(
            data=wiki_space_service.ingest_wiki_sources(
                space_id,
                [str(source_id) for source_id in payload.source_ids],
            )
        )
    except (WikiSpaceNotFoundError, WikiSourceNotFoundError) as exc:
        raise _not_found(exc) from exc
    except WikiSourceBusyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.detail) from exc


@router.get("/{space_id}/sources/{source_id}", response_model=ApiEnvelope[WikiSourceDetailRead])
def get_wiki_source(
    space_id: str,
    source_id: str,
) -> ApiEnvelope[WikiSourceDetailRead]:
    """读取指定 WIKI 来源的详情、关联页面和任务历史。"""
    try:
        return ApiEnvelope(data=wiki_space_service.get_wiki_source(space_id, source_id))
    except WikiSourceNotFoundError as exc:
        raise _not_found(exc) from exc


@router.get(
    "/{space_id}/sources/{source_id}/deletion-impact",
    response_model=ApiEnvelope[WikiSourceDeleteImpact],
)
def get_wiki_source_delete_impact(
    space_id: str,
    source_id: str,
) -> ApiEnvelope[WikiSourceDeleteImpact]:
    """删除前返回影响页面，供前端二次确认。"""
    try:
        return ApiEnvelope(
            data=wiki_space_service.get_wiki_source_delete_impact(space_id, source_id)
        )
    except WikiSourceNotFoundError as exc:
        raise _not_found(exc) from exc


@router.get("/{space_id}/jobs", response_model=ApiEnvelope[list[WikiIngestJobRead]])
def list_wiki_ingest_jobs(space_id: str) -> ApiEnvelope[list[WikiIngestJobRead]]:
    """返回空间内最近的摄入任务。"""
    try:
        return ApiEnvelope(data=wiki_space_service.list_wiki_ingest_jobs(space_id))
    except WikiSpaceNotFoundError as exc:
        raise _not_found(exc) from exc


@router.post("/{space_id}/jobs/{job_id}/retries", response_model=ApiEnvelope[WikiIngestJobRead])
def retry_wiki_ingest_job(
    space_id: str,
    job_id: str,
) -> ApiEnvelope[WikiIngestJobRead]:
    """基于失败任务的来源重新创建一个 queued job。"""
    try:
        return ApiEnvelope(data=wiki_space_service.retry_wiki_ingest_job(space_id, job_id))
    except (WikiJobNotFoundError, WikiSourceNotFoundError) as exc:
        raise _not_found(exc) from exc
    except WikiSourceBusyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.detail) from exc
    except WikiJobRetryConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.detail) from exc


@router.patch("/{space_id}/jobs/{job_id}", response_model=ApiEnvelope[WikiIngestJobRead])
def cancel_wiki_ingest_job(
    space_id: str,
    job_id: str,
    payload: WikiIngestJobUpdate,
) -> ApiEnvelope[WikiIngestJobRead]:
    """请求取消 queued/running 任务；running 任务会在阶段边界生效。"""
    try:
        if payload.status != "canceled":
            raise WikiJobCancelConflictError
        return ApiEnvelope(data=wiki_space_service.cancel_wiki_ingest_job(space_id, job_id))
    except WikiJobNotFoundError as exc:
        raise _not_found(exc) from exc
    except WikiJobCancelConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.detail) from exc


@router.delete("/{space_id}/sources/{source_id}", response_model=ApiEnvelope[dict[str, bool]])
def delete_wiki_source(space_id: str, source_id: str) -> ApiEnvelope[dict[str, bool]]:
    """删除指定 WIKI 来源记录。"""
    try:
        return ApiEnvelope(data=wiki_space_service.delete_wiki_source(space_id, source_id))
    except WikiSourceNotFoundError as exc:
        raise _not_found(exc) from exc
