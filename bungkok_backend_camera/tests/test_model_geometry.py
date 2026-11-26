import pytest
import math
from types import SimpleNamespace

from model.posture_backend_v3 import PostureBackendV3
from session_service import empty_metrics, record_prediction


def side_landmarks(lean, width=640, height=480):
    points = [SimpleNamespace(x=.5, y=.5, visibility=.9) for _ in range(33)]
    dx = math.tan(math.radians(lean)) * (.4 * height) / width
    for shoulder, hip, offset in ((11, 23, 0), (12, 24, .03)):
        points[shoulder].x, points[shoulder].y = .5 + offset + dx, .3
        points[hip].x, points[hip].y = .5 + offset, .7
    return points


@pytest.mark.parametrize('width,height', [(640, 480), (480, 640)])
def test_side_angle_uses_pixel_aspect_ratio(width, height):
    features = PostureBackendV3._side_alignment_features(side_landmarks(10, width, height), width, height)
    assert features['side_alignment_available']
    assert features['side_torso_lean_deg'] == pytest.approx(10)


@pytest.mark.parametrize('lean,expected', [(4, True), (14, True), (25, False)])
def test_side_preparation_ignores_hidden_shoulder_depth_noise(lean, expected):
    model = PostureBackendV3.__new__(PostureBackendV3)
    model.config = {}
    features = PostureBackendV3._side_alignment_features(side_landmarks(lean), 640, 480)
    model.extract = lambda *args, **kwargs: {
        'status': 'features_ready', 'camera_mode': 'full_torso',
        'v2_torso_lean_deg': 22, 'v2_shoulder_roll_deg': 17, **features,
    }
    assert model.detect('unused')['is_upright'] is expected


def test_side_alignment_requires_visible_torso():
    points = side_landmarks(0)
    points[23].visibility = points[24].visibility = .2
    assert not PostureBackendV3._side_alignment_features(points, 640, 480)['side_alignment_available']


def test_side_angle_does_not_jump_when_visibility_crosses():
    points = side_landmarks(5)
    points[12].x = points[24].x + math.tan(math.radians(22)) * (.4 * 480) / 640
    points[11].visibility = .91
    before = PostureBackendV3._side_alignment_features(points, 640, 480)
    points[11].visibility = .89
    after = PostureBackendV3._side_alignment_features(points, 640, 480)
    assert abs(before['side_torso_lean_deg'] - after['side_torso_lean_deg']) < 1


def test_front_view_keeps_existing_alignment_rules():
    points = side_landmarks(0)
    points[11].x, points[12].x = .2, .8
    assert not PostureBackendV3._side_alignment_features(points, 640, 480)['side_alignment_available']


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


def front_arm_landmarks():
    # Bahu kiri pengguna (11) di x=.65, kanan (12) di x=.35 → lebar bahu .30
    points = [SimpleNamespace(x=.5, y=.5, visibility=.9) for _ in range(33)]
    points[11].x, points[11].y = .65, .55
    points[12].x, points[12].y = .35, .55
    return points


def test_own_raised_arm_counts_as_arm_activity():
    points = front_arm_landmarks()
    points[13].x, points[13].y = .75, .40   # siku naik di sisi sendiri
    points[15].x, points[15].y = .72, .25   # pergelangan di atas bahu
    assert PostureBackendV3._arm_state(points, 11, 13, 15, 12, .30) == (True, True)


def test_friend_hand_attached_to_user_wrist_is_rejected():
    points = front_arm_landmarks()
    # Siku pengguna masih di bawah (santai), tapi "pergelangan" melompat ke tangan teman di atas
    points[13].x, points[13].y = .70, .80
    points[15].x, points[15].y = .80, .32
    valid, raised = PostureBackendV3._arm_state(points, 11, 13, 15, 12, .30)
    assert not raised


def test_elbow_crossing_to_other_side_is_rejected():
    points = front_arm_landmarks()
    points[13].x, points[13].y = .38, .42   # "siku kiri" muncul di sisi bahu kanan
    points[15].x, points[15].y = .40, .28
    assert PostureBackendV3._arm_state(points, 11, 13, 15, 12, .30) == (False, False)


def test_hidden_elbow_is_not_counted():
    points = front_arm_landmarks()
    points[13].visibility = .2
    points[15].x, points[15].y = .72, .25
    assert PostureBackendV3._arm_state(points, 11, 13, 15, 12, .30) == (False, False)
