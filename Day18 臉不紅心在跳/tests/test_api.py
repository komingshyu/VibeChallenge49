
# -*- coding: utf-8 -*-
from fastapi.testclient import TestClient
from app import app

def test_measurement_crud():
    client = TestClient(app)
    r = client.post("/api/measurements", json={"name":"測試","notes":"n"})
    assert r.status_code==200 and r.json().get("ok")
    mid = r.json()["id"]
    r = client.patch(f"/api/measurements/{mid}", json={"name":"新名"})
    assert r.status_code==200 and r.json().get("ok")
    r = client.get("/api/measurements")
    assert r.status_code==200 and r.json().get("ok")
    r = client.delete(f"/api/measurements/{mid}")
    assert r.status_code==200 and r.json().get("ok")
