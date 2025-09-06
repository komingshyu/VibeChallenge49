
import os, json, pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models import store

@pytest.fixture(scope='module')
def client():
    return TestClient(app)

def test_project_flow(client):
    r = client.post('/api/project/new')
    pid = r.json()['project_id']
    tpls = client.get('/api/templates').json()['templates']
    assert len(tpls) >= 3
    # mock outlines for storyboard
    p = store.get_project(pid)
    p['outlines'] = [{
        "id":"o1","title":"測試大綱","logline":"log",
        "cast":[{"id":"c1","name":"小虎","role":"protagonist","description":"勇敢","appearance_prompt":""}],
        "beats":[f"節拍{i}" for i in range(1,15)]
    }]
    store.put_project(pid, p)
    sb = client.post(f'/api/storyboard/{pid}/0').json()
    assert len(sb['spreads']) == 14
    ch = client.post(f'/api/characters/{pid}', json={"name":"小虎","role":"主角","description":"勇敢","appearance_prompt":""}).json()
    cid = ch['character']['id']
    client.put(f'/api/characters/{pid}/{cid}', json={"description":"更勇敢"})
    client.delete(f'/api/characters/{pid}/{cid}')
