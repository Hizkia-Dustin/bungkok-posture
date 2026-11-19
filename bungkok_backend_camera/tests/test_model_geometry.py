import pytest
from types import SimpleNamespace

from model.posture_backend_v3 import PostureBackendV3
from session_service import empty_metrics, record_prediction


def test_relative_head_roll_ignores_camera_roll():
    assert PostureBackendV3._relative_roll_degrees(1, .1, 1, .1) == pytest.approx(0)


def test_relative_head_roll_keeps_real_tilt():
    tilt = PostureBackendV3._relative_roll_degrees(1, .1, 1, .23)
    assert 7 < tilt < 8


def test_phone_glance_is_allowed_only_while_torso_stays_stable():
    thresholds = {}
    assert PostureBackendV3._is_head_activity(
        pitch_ratio=1.5, head_center_offset=.03, shoulder_roll_deg=4,
        neck_drop=-.16, z_delta=.03, ear_z_delta=.02, thresholds=thresholds,
    )
    assert not PostureBackendV3._is_head_activity(
        pitch_ratio=1.5, head_center_offset=.03, shoulder_roll_deg=4,
        neck_drop=-.31, z_delta=.12, ear_z_delta=.08, thresholds=thresholds,
    )


def test_prediction_requires_three_lean_frames_before_label_switch(monkeypatch):
    monkeypatch.setattr('session_service.time.time', lambda: 100.0)
    row = SimpleNamespace(
        started_at=99.0, ended_at=None, paused=0, pause_started_at=None,
        last_sample_at=99.8, metrics=empty_metrics(), config={'mode': 'work'}, id='test',
    )
    db = SimpleNamespace(add=lambda _row: None)
    upright = {'status': 'ok', 'label': 0}
    forward = {'status': 'ok', 'label': 1}

    assert record_prediction(db, row, upright)['stable_prediction'] == 'tegak'
    assert record_prediction(db, row, forward)['stable_prediction'] == 'tegak'
    assert record_prediction(db, row, forward)['stable_prediction'] == 'tegak'
    assert record_prediction(db, row, forward)['stable_prediction'] == 'condong_depan'
