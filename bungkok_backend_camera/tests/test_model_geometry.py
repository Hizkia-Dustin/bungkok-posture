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
    assert PostureBackendV3._arm_state(points, 11, 13, 15, 12) == (True, True)


def test_friend_hand_attached_to_user_wrist_is_rejected():
    points = front_arm_landmarks()
    # Siku pengguna masih di bawah (santai), tapi "pergelangan" melompat ke tangan teman di atas
    points[13].x, points[13].y = .70, .80
    points[15].x, points[15].y = .80, .32
    valid, raised = PostureBackendV3._arm_state(points, 11, 13, 15, 12)
    assert not raised


def test_elbow_crossing_to_other_side_is_rejected():
    points = front_arm_landmarks()
    points[13].x, points[13].y = .38, .42   # "siku kiri" muncul di sisi bahu kanan
    points[15].x, points[15].y = .40, .28
    assert PostureBackendV3._arm_state(points, 11, 13, 15, 12) == (False, False)


def test_hidden_elbow_is_not_counted():
    points = front_arm_landmarks()
    points[13].visibility = .2
    points[15].x, points[15].y = .72, .25
    assert PostureBackendV3._arm_state(points, 11, 13, 15, 12) == (False, False)


def side_profile_landmarks(ear, nose, shoulder=(.45, .33), hip=(.44, .85), mirror=False):
    """Kamera HP dari samping, pengguna menghadap kiri frame (mirror=True → menghadap kanan)."""
    flip = (lambda x: 1 - x) if mirror else (lambda x: x)
    points = [SimpleNamespace(x=.5, y=.5, visibility=.9) for _ in range(33)]
    for idx, (x, y) in ((0, nose), (7, ear), (8, (ear[0] + .01, ear[1])),
                        (11, shoulder), (12, (shoulder[0] + .01, shoulder[1])),
                        (23, hip), (24, (hip[0] + .01, hip[1]))):
        points[idx].x, points[idx].y = flip(x), y
    return points


HUNCHED = dict(ear=(.32, .24), nose=(.25, .30))   # kepala jauh di depan bahu (seperti mengetik di laptop)
UPRIGHT = dict(ear=(.44, .18), nose=(.38, .22))   # telinga hampir tegak lurus di atas bahu


@pytest.mark.parametrize('mirror', [False, True])
def test_side_view_measures_forward_head_in_both_facings(mirror):
    hunched = PostureBackendV3._side_alignment_features(side_profile_landmarks(**HUNCHED, mirror=mirror), 640, 480)
    upright = PostureBackendV3._side_alignment_features(side_profile_landmarks(**UPRIGHT, mirror=mirror), 640, 480)
    assert hunched['side_neck_available'] and upright['side_neck_available']
    assert hunched['side_neck_flexion_deg'] > 55
    assert upright['side_neck_flexion_deg'] < 10
    # Garis bahu–pinggul tetap hampir tegak: inilah kenapa aturan lama meloloskan bungkuk ini
    assert abs(hunched['side_torso_forward_deg']) < 5


def test_side_view_flags_forward_head_even_with_straight_torso():
    features = PostureBackendV3._side_alignment_features(side_profile_landmarks(**HUNCHED), 640, 480)
    thresholds = {}
    calibrated = {'baseline_side_neck_flexion': 5.0, 'baseline_side_torso_forward': 0.0}
    assert PostureBackendV3._side_view_label(features, calibrated, thresholds) == (1, 'head_forward')
    # Batas absolut tetap menangkap bungkuk walau kalibrasi lama tidak punya baseline leher
    assert PostureBackendV3._side_view_label(features, {}, thresholds) == (1, 'head_forward')


def test_side_view_keeps_upright_and_light_screen_glance():
    upright = PostureBackendV3._side_alignment_features(side_profile_landmarks(**UPRIGHT), 640, 480)
    calibrated = {'baseline_side_neck_flexion': 5.0, 'baseline_side_torso_forward': 0.0}
    assert PostureBackendV3._side_view_label(upright, calibrated, {}) == (0, None)
    glance = {'side_alignment_available': True, 'side_torso_forward_deg': 3.0,
              'side_neck_available': True, 'side_neck_flexion_deg': 17.0}
    assert PostureBackendV3._side_view_label(glance, calibrated, {}) == (0, None)


@pytest.mark.parametrize('torso,expected', [(15.0, (1, 'torso_forward')), (-14.0, (2, 'torso_backward'))])
def test_side_view_torso_lean_relative_to_calibration(torso, expected):
    features = {'side_alignment_available': True, 'side_torso_forward_deg': torso,
                'side_neck_available': True, 'side_neck_flexion_deg': 8.0}
    calibrated = {'baseline_side_neck_flexion': 8.0, 'baseline_side_torso_forward': 1.0}
    assert PostureBackendV3._side_view_label(features, calibrated, {}) == expected


def test_side_calibration_rejects_forward_head():
    model = PostureBackendV3.__new__(PostureBackendV3)
    model.config = {}
    features = PostureBackendV3._side_alignment_features(side_profile_landmarks(**HUNCHED), 640, 480)
    model.extract = lambda *args, **kwargs: {
        'status': 'features_ready', 'camera_mode': 'full_torso',
        'v2_torso_lean_deg': 3, 'v2_shoulder_roll_deg': 2, **features,
    }
    result = model.detect('unused')
    assert result['is_upright'] is False
    assert 'telinga sejajar bahu' in result['alignment_feedback']

@pytest.mark.parametrize("width,height", [(640, 480), (1280, 720)])
def test_straight_overhead_arm_counts_in_pixel_geometry(width, height):
    points = front_arm_landmarks()
    points[11].y = points[12].y = .90
    for idx, distance in [(13, .23), (15, .45)]:
        points[idx].x = .65
        points[idx].y = .90 - distance * width / height
    assert PostureBackendV3._arm_state(points, 11, 13, 15, 12, height / width) == (True, True)
    points[15].visibility = .1
    assert PostureBackendV3._arm_state(points, 11, 13, 15, 12, height / width) == (True, True)


def test_stretch_count_requires_a_hold_and_release(monkeypatch):
    row = SimpleNamespace(started_at=99, ended_at=None, paused=0, pause_started_at=None,
                          last_sample_at=99, metrics=empty_metrics(), config={'mode': 'work'}, id='test')
    db = SimpleNamespace(add=lambda _: None)
    monkeypatch.setattr('session_service.time.time', lambda: row.last_sample_at + .5)
    counts = []
    for raised in (True, False, True, True, True, None, True, False, False, True, True):
        frame = {'status': 'ok', 'label': 0, 'upper_is_arm_activity': raised} if raised is not None else {}
        counts.append(record_prediction(db, row, frame)['metrics']['stretches'])
    assert counts == [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2]


def test_face_match_requires_one_face_at_the_pose_nose():
    nose = SimpleNamespace(x=.5, y=.40)
    def face(x):
        return SimpleNamespace(keypoints=[SimpleNamespace(x=x+dx, y=y)
                               for dx, y in ((-.05,.35),(.05,.35),(0,.40),(0,.45))])
    model = PostureBackendV3.__new__(PostureBackendV3)
    image = SimpleNamespace(width=640, height=480)
    candidates = [face(.8), face(.5)]
    model.face_detector = SimpleNamespace(detect=lambda _: SimpleNamespace(detections=candidates))
    assert model._matched_face(image, [nose]) is candidates[1].keypoints
    candidates.append(face(.51))
    assert model._matched_face(image, [nose]) is None
    candidates[:] = [face(.8)]
    assert model._matched_face(image, [nose]) is None
