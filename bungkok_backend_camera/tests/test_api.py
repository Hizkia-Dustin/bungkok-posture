import uuid

from fastapi.testclient import TestClient

from app import create_app
from auth import current_user


class FakeBackend:
    config = {"model_name": "fake-posture-model", "calibration": {"minimum_images": 3}}
    def close(self): pass
    def detect(self, path, camera_mode="auto"):
        return {"status": "ok", "is_upright": True, "landmarks": []}
    def calibrate(self, paths, camera_mode="auto"):
        return {"camera_mode": camera_mode, "valid_samples": len(paths), "rejected_samples": [], "forward_baseline": .1}
    def predict(self, path, calibration):
        return {"status": "ok", "label": 0, "prediction": "tegak", "landmarks": []}


def image(name="frame.jpg"):
    return (name, b"fake-image-data", "image/jpeg")


def client_for(email="user@example.com"):
    app = create_app(FakeBackend())
    identity = {"id": str(uuid.uuid4()), "email": email, "user_metadata": {"name": "Pengguna Baru"}}
    app.dependency_overrides[current_user] = lambda: identity
    return TestClient(app), identity


def test_new_account_has_zero_progress():
    client, _ = client_for()
    with client:
        response = client.get("/api/account")
        assert response.status_code == 200
        state = response.json()
        assert state["user"]["points"] == 0
        assert state["user"]["totalPointsCumulative"] == 0
        assert state["validSessions"] == 0
        assert state["pointsHistory"] == []
        assert state["ownedItems"] == {}
        assert all(not badge["unlocked"] for badge in state["badges"])
        assert all(challenge["current"] == 0 for challenge in state["challenges"])


def test_camera_flow_requires_owned_calibration():
    client, _ = client_for()
    with client:
        calibration = client.post("/api/calibrations", files=[
            ("images", image("one.jpg")), ("images", image("two.jpg")), ("images", image("three.jpg")),
        ])
        assert calibration.status_code == 200
        calibration_id = calibration.json()["calibration_id"]
        prediction = client.post("/api/predict", data={"calibration_id": calibration_id}, files={"image": image()})
        assert prediction.status_code == 200
        client.delete(f"/api/calibrations/{calibration_id}")
        assert client.post("/api/predict", data={"calibration_id": calibration_id}, files={"image": image()}).status_code == 404


def test_regular_user_cannot_open_admin_dashboard():
    client, _ = client_for()
    with client:
        assert client.get("/api/admin/overview").status_code == 403


def test_admin_can_edit_runtime_configuration(monkeypatch):
    email = "owner@example.com"
    monkeypatch.setenv("ADMIN_EMAILS", email)
    client, _ = client_for(email)
    with client:
        overview = client.get("/api/admin/overview")
        assert overview.status_code == 200
        configuration = overview.json()["configuration"]
        configuration["reminder"]["message"] = "Badan kamu bungkuk. Tegakkan kembali."
        saved = client.put("/api/admin/configuration", json=configuration)
        assert saved.status_code == 200
        assert saved.json()["reminder"]["message"].startswith("Badan kamu")


def test_camera_frames_require_points_but_admin_can_unlock_for_testing(monkeypatch):
    regular, _ = client_for()
    with regular:
        assert regular.post('/api/rewards/frame-sadar/redeem').status_code == 409

    email = 'frame-admin@example.com'
    monkeypatch.setenv('ADMIN_EMAILS', email)
    admin, _ = client_for(email)
    with admin:
        before = admin.get('/api/account').json()['user']['points']
        unlocked = admin.post('/api/rewards/frame-sadar/redeem')
        assert unlocked.status_code == 200
        assert unlocked.json()['ownedItems']['frame-sadar'] is True
        assert unlocked.json()['user']['points'] == before
        equipped = admin.put('/api/rewards/equipped', json={'frame-sadar': True, 'frame-turns-on': False})
        assert equipped.status_code == 200
        assert equipped.json()['equippedItems']['frame-sadar'] is True


def test_admin_can_read_and_answer_user_report(monkeypatch):
    admin_email = 'support-admin@example.com'
    monkeypatch.setenv('ADMIN_EMAILS', admin_email)
    app = create_app(FakeBackend())
    reporter_id = str(uuid.uuid4())
    identity = {"id": reporter_id, "email": "reporter@example.com", "user_metadata": {"name": "Pelapor"}}
    app.dependency_overrides[current_user] = lambda: identity

    with TestClient(app) as client:
        created = client.post('/api/reports', json={
            'title': 'Frame menutupi kamera', 'category': 'Saran / masukan',
            'description': 'Tolong periksa tampilan frame saat latihan berlangsung.', 'device': 'Browser uji',
        })
        assert created.status_code == 200
        ticket_id = created.json()['id']

        identity = {"id": str(uuid.uuid4()), "email": admin_email, "user_metadata": {"name": "Admin"}}
        overview = client.get('/api/admin/overview')
        assert overview.status_code == 200
        assert overview.json()['reports'][0]['user']['email'] == 'reporter@example.com'

        updated = client.patch(f'/api/admin/reports/{ticket_id}', json={
            'status': 'Ditangani', 'message': 'Kami sedang memeriksa frame tersebut.',
        })
        assert updated.status_code == 200
        assert updated.json()['teamReply']['message'].startswith('Kami sedang')

        identity = {"id": reporter_id, "email": "reporter@example.com", "user_metadata": {"name": "Pelapor"}}
        account_state = client.get('/api/account').json()
        assert account_state['reports'][0]['status'] == 'Ditangani'
        assert account_state['reports'][0]['teamReply']['message'].startswith('Kami sedang')
