"""Calibrated three-class seated-posture inference for the BUNGKOK backend.

Supports both:
1. Upper-Body mode (webcam depan meja kerja: kepala, leher, bahu).
   Includes:
   - Cervical Sagittal Angle & Ear-Shoulder Forward Z tracking (Forward Head / Turtle Neck).
   - Facial Pitch Ratio (Mendongak ke atas vs Menunduk ke bawah).
   - Shoulder Roll & Symmetry.
2. Full-Torso mode (kamera samping/serong: bahu, pinggul, lutut).

This module classifies posture, not a medical condition. The caller must calibrate
with at least three upright images from the same fixed camera before prediction.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

import numpy as np


class PostureBackendV3:
    def __init__(self, pose_model_path: str | Path, config_path: str | Path):
        import mediapipe as mp

        self.mp = mp
        self.config = json.loads(Path(config_path).read_text(encoding="utf-8"))
        options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(Path(pose_model_path))),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_poses=2,
        )
        self.detector = mp.tasks.vision.PoseLandmarker.create_from_options(options)
        face_options = mp.tasks.vision.FaceDetectorOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(Path(pose_model_path).with_name("blaze_face_short_range.tflite"))),
            min_detection_confidence=0.7,
        )
        self.face_detector = mp.tasks.vision.FaceDetector.create_from_options(face_options)
        self.last_user_center: tuple[float, float] | None = None

    def _score_pose_candidate(self, p_landmarks: Any) -> float:
        """Pemberian skor cerdas untuk memilih pengguna utama di tengah layar."""
        try:
            sh_l = p_landmarks[11]
            sh_r = p_landmarks[12]
            nose = p_landmarks[0]
            eye_l = p_landmarks[2]
            eye_r = p_landmarks[5]

            # 1. Lebar bahu dalam 2D
            span = float(np.hypot(sh_r.x - sh_l.x, sh_r.y - sh_l.y))
            if span < 0.08:
                return -100.0

            # 2. Visibilitas wajah dan bahu
            face_vis = float((nose.visibility or 0.0) * 0.5 + ((eye_l.visibility or 0.0) + (eye_r.visibility or 0.0)) * 0.25)
            shoulder_vis = float(((sh_l.visibility or 0.0) + (sh_r.visibility or 0.0)) * 0.5)
            if face_vis < 0.20 or shoulder_vis < 0.20:
                return -50.0

            # 3. Jarak ke pusat webcam (x=0.5)
            mid_x = (sh_l.x + sh_r.x) / 2.0
            mid_y = (sh_l.y + sh_r.y) / 2.0
            center_dist = abs(mid_x - 0.5)
            center_score = max(0.0, 1.0 - (center_dist * 2.2))

            # 4. Konsistensi temporal dengan pose sebelumnya
            temporal_bonus = 0.0
            if self.last_user_center is not None:
                prev_x, prev_y = self.last_user_center
                dist_to_prev = float(np.hypot(mid_x - prev_x, mid_y - prev_y))
                if dist_to_prev < 0.25:
                    temporal_bonus = 3.0 * (1.0 - (dist_to_prev / 0.25))

            return (span * 3.0) + (face_vis * 2.5) + (shoulder_vis * 2.0) + (center_score * 2.0) + temporal_bonus
        except Exception:
            return -999.0

    def close(self) -> None:
        self.detector.close()
        self.face_detector.close()

    def __enter__(self) -> "PostureBackendV3":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    @staticmethod
    def _angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
        u = a - b
        v = c - b
        denominator = np.linalg.norm(u) * np.linalg.norm(v)
        if denominator < 1e-8:
            return float("nan")
        cosine = np.clip(np.dot(u, v) / denominator, -1.0, 1.0)
        return float(np.degrees(np.arccos(cosine)))

    @staticmethod
    def _world_point(world: Any, index: int) -> np.ndarray:
        point = world[index]
        return np.array([point.x, point.y, point.z], dtype=float)

    @staticmethod
    def _relative_roll_degrees(
        reference_dx: float, reference_dy: float, subject_dx: float, subject_dy: float
    ) -> float:
        """Roll relatif mengabaikan kamera/badan yang sedikit miring."""
        reference = np.degrees(np.arctan2(reference_dy, reference_dx))
        subject = np.degrees(np.arctan2(subject_dy, subject_dx))
        return float(abs((subject - reference + 180.0) % 360.0 - 180.0))

    @staticmethod
    def _is_head_activity(
        *, pitch_ratio: float, head_center_offset: float, shoulder_roll_deg: float,
        neck_drop: float, z_delta: float, ear_z_delta: float, thresholds: dict[str, Any]
    ) -> bool:
        looking_at_task = (
            pitch_ratio > thresholds.get("max_pitch_ratio_upright", 1.28)
            or head_center_offset > thresholds.get("head_activity_center_offset", 0.10)
        )
        torso_stable = (
            shoulder_roll_deg <= thresholds.get("head_activity_max_shoulder_roll_deg", 10.0)
            and neck_drop >= thresholds.get("head_activity_min_neck_drop_ratio", -0.22)
            and z_delta <= thresholds.get("head_activity_max_nose_z_delta", 0.085)
            and ear_z_delta <= thresholds.get("head_activity_max_ear_z_delta", 0.060)
        )
        severe_forward = (
            neck_drop < thresholds.get("severe_forward_neck_drop_ratio", -0.28)
            or z_delta > thresholds.get("severe_forward_nose_z_delta", 0.10)
            or ear_z_delta > thresholds.get("severe_forward_ear_z_delta", 0.075)
        )
        return bool(looking_at_task and torso_stable and not severe_forward)

    @staticmethod
    def _serialize_landmarks(normalized: Any) -> list[dict[str, float]]:
        return [
            {
                "x": round(float(lm.x), 4),
                "y": round(float(lm.y), 4),
                "z": round(float(lm.z), 4),
                "visibility": round(float(lm.visibility or 0.0), 3),
            }
            for lm in normalized
        ]

    def _torso_features(self, world: Any) -> dict[str, float]:
        left_shoulder = self._world_point(world, 11)
        right_shoulder = self._world_point(world, 12)
        left_hip = self._world_point(world, 23)
        right_hip = self._world_point(world, 24)
        shoulders = (left_shoulder + right_shoulder) / 2.0
        hips = (left_hip + right_hip) / 2.0
        across = right_shoulder - left_shoulder
        width = float(np.linalg.norm(across))
        if width < 1e-6:
            raise ValueError("Lebar bahu tidak valid")

        side_axis = across / width
        front_axis = np.cross(side_axis, np.array([0.0, 1.0, 0.0]))
        front_norm = float(np.linalg.norm(front_axis))
        if front_norm < 1e-6:
            raise ValueError("Arah tubuh tidak valid")
        front_axis /= front_norm
        torso = shoulders - hips
        horizontal = float(np.linalg.norm(torso[[0, 2]]))

        features = {
            "v2_torso_vertical_ratio": abs(torso[1]) / width,
            "v2_torso_forward_ratio": float(np.dot(torso, front_axis)) / width,
            "v2_torso_lateral_ratio": float(np.dot(torso, side_axis)) / width,
            "v2_torso_lean_deg": float(np.degrees(
                np.arctan2(horizontal, abs(torso[1]) + 1e-8)
            )),
            "v2_shoulder_roll_deg": float(np.degrees(np.arctan2(
                abs(left_shoulder[1] - right_shoulder[1]),
                np.linalg.norm((left_shoulder - right_shoulder)[[0, 2]]) + 1e-8,
            ))),
            "v2_shoulder_depth_ratio": abs(left_shoulder[2] - right_shoulder[2]) / width,
        }
        if not np.isfinite(list(features.values())).all():
            raise ValueError("Fitur pose mengandung NaN/inf")
        return features

    @staticmethod
    def _side_alignment_features(normalized: Any, width: int, height: int) -> dict[str, Any]:
        # Pixel coordinates keep angles consistent across portrait/landscape cameras.
        sides = []
        for shoulder, hip in ((11, 23), (12, 24)):
            s, h = normalized[shoulder], normalized[hip]
            confidence = min(float(s.visibility or 0), float(h.visibility or 0))
            dx, dy = (s.x - h.x) * width, (h.y - s.y) * height
            if confidence >= 0.5 and dy > height * 0.08:
                sides.append((confidence, dx, dy))
        if not sides:
            return {"side_alignment_available": False}
        # Blend similarly visible sides instead of switching at each confidence crossover.
        weights = [confidence ** 4 for confidence, _, _ in sides]
        total_weight = sum(weights)
        dx = sum(weight * side[1] for weight, side in zip(weights, sides)) / total_weight
        dy = sum(weight * side[2] for weight, side in zip(weights, sides)) / total_weight
        shoulder_span = abs(normalized[11].x - normalized[12].x) * width
        hip_span = abs(normalized[23].x - normalized[24].x) * width
        profile = max(shoulder_span, hip_span) / dy < 0.55

        # Arah hadap: hidung berada di depan bahu. +1 = menghadap ke kanan frame.
        mid_shoulder_x = (normalized[11].x + normalized[12].x) / 2.0
        facing = 1.0 if normalized[0].x >= mid_shoulder_x else -1.0

        # Leher maju (forward head): sudut garis bahu→telinga dari vertikal, positif = kepala di depan bahu.
        # Ini yang terlihat saat membungkuk ke laptop walau garis bahu–pinggul masih hampir tegak.
        necks = []
        for ear, shoulder in ((7, 11), (8, 12)):
            e, s = normalized[ear], normalized[shoulder]
            confidence = min(float(e.visibility or 0), float(s.visibility or 0))
            up = (s.y - e.y) * height
            if confidence >= 0.5 and up > 0:
                necks.append((confidence ** 4, (e.x - s.x) * width * facing, up))
        neck_flexion = None
        if necks:
            neck_weight = sum(n[0] for n in necks)
            neck_dx = sum(n[0] * n[1] for n in necks) / neck_weight
            neck_up = sum(n[0] * n[2] for n in necks) / neck_weight
            neck_flexion = float(np.degrees(np.arctan2(neck_dx, neck_up)))

        return {
            "side_alignment_available": bool(profile),
            "side_torso_lean_deg": float(np.degrees(np.arctan2(abs(dx), dy))),
            # Bertanda: positif = bahu condong ke depan dari pinggul, negatif = bersandar.
            "side_torso_forward_deg": float(np.degrees(np.arctan2(dx * facing, dy))),
            "side_neck_available": bool(profile) and neck_flexion is not None,
            "side_neck_flexion_deg": neck_flexion,
        }

    @staticmethod
    def _arm_state(
        normalized: Any, sh_idx: int, el_idx: int, wr_idx: int, opp_sh_idx: int, y_scale: float = 1.0
    ) -> tuple[bool, bool]:
        """Validasi anatomis lengan: (lengan milik pengguna?, terangkat?).

        Tangan teman yang masuk frame sering ditempelkan MediaPipe ke pergelangan pengguna.
        Lengan baru dianggap milik pengguna jika rantai bahu-siku-pergelangan masuk akal:
        siku terlihat, panjang lengan atas & bawah sebanding lebar bahu, dan siku tetap
        di sisi bahunya sendiri.
        """
        sh = normalized[sh_idx]
        el = normalized[el_idx]
        wr = normalized[wr_idx]
        opp = normalized[opp_sh_idx]
        if min(sh.visibility or 0, opp.visibility or 0, el.visibility or 0) < 0.45:
            return False, False
        # Express both axes in units of image width, including on a widescreen webcam.
        def length(a, b):
            return float(np.hypot(a.x - b.x, (a.y - b.y) * y_scale))

        shoulder_width = length(sh, opp)
        if shoulder_width < 0.05:
            return False, False
        upper_arm = length(el, sh) / shoulder_width
        mid_x = (sh.x + opp.x) / 2
        own_side = 1 if sh.x >= opp.x else -1
        if not 0.20 <= upper_arm <= 1.20 or (el.x - mid_x) * own_side < -0.25 * shoulder_width:
            return False, False
        elbow_lift = (sh.y - el.y) * y_scale / shoulder_width
        if (wr.visibility or 0) < 0.38 or not (0 <= wr.x <= 1 and 0 <= wr.y <= 1):
            # A clearly raised elbow is still visible when the hand leaves the top of the frame.
            raised = elbow_lift > 0.35 and (el.visibility or 0) >= 0.75 and 0 <= el.y <= 1
            return raised, raised
        forearm = length(wr, el) / shoulder_width
        if not 0.18 <= forearm <= 1.15 or not 0.35 <= forearm / upper_arm <= 2.2:
            return False, False
        is_raised = (sh.y - wr.y) * y_scale > 0.12 * shoulder_width or elbow_lift > 0.20
        return True, is_raised

    def _matched_face(self, image, pose):
        nose = pose[0]
        matches = []
        for detection in self.face_detector.detect(image).detections:
            points = detection.keypoints
            if len(points) < 4:
                continue
            right, left, tip, mouth = points[:4]
            span = abs(left.x - right.x)
            distance = np.hypot(tip.x - nose.x, (tip.y - nose.y) * image.height / image.width)
            if span > 0.015 and distance < 0.65 * span and mouth.y - tip.y > 0.004 and tip.y > (left.y + right.y) / 2:
                matches.append(points)
        return matches[0] if len(matches) == 1 else None

    def _upper_body_features(self, normalized: Any, world: Any, y_scale: float, face) -> dict[str, Any]:
        ls_norm = normalized[11]
        rs_norm = normalized[12]
        nose_norm = normalized[0]

        # 2D geometry
        shoulder_dx = rs_norm.x - ls_norm.x
        shoulder_dy = rs_norm.y - ls_norm.y
        shoulder_width_2d = float(np.hypot(shoulder_dx, shoulder_dy))
        if shoulder_width_2d < 1e-5:
            raise ValueError("Bahu terlalu dekat atau tidak terdeteksi")

        mid_sh_x = (ls_norm.x + rs_norm.x) / 2.0
        mid_sh_y = (ls_norm.y + rs_norm.y) / 2.0

        # In image coordinates, y increases downward.
        # When head is above shoulders, mid_sh_y > nose_norm.y
        neck_dy = mid_sh_y - nose_norm.y
        neck_ratio = float(neck_dy / shoulder_width_2d)
        shoulder_roll = float(abs(shoulder_dy) / shoulder_width_2d)
        shoulder_roll_deg = float(np.degrees(np.arctan2(abs(shoulder_dy), abs(shoulder_dx) + 1e-8)))

        # Head tilt (roll)
        ear_left = normalized[7]
        ear_right = normalized[8]
        ear_dx = ear_right.x - ear_left.x
        ear_dy = ear_right.y - ear_left.y
        ear_tilt = self._relative_roll_degrees(shoulder_dx, shoulder_dy, ear_dx, ear_dy)
        head_tilt_deg = ear_tilt
        pitch_ratio = 1.0
        if face is not None:
            right_eye, left_eye, face_nose, mouth = face[:4]
            eye_tilt = self._relative_roll_degrees(shoulder_dx, shoulder_dy,
                right_eye.x - left_eye.x, right_eye.y - left_eye.y)
            head_tilt_deg = float(np.median([ear_tilt, eye_tilt]))
            eye_y = (right_eye.y + left_eye.y) / 2
            pitch_ratio = (face_nose.y - eye_y) / (mouth.y - face_nose.y)
        is_mendongak = pitch_ratio < 0.78
        is_menunduk = pitch_ratio > 1.28

        # Centering (horizontal offset of nose from mid shoulders)
        head_center_offset = float(abs(nose_norm.x - mid_sh_x))

        # 3D world forward displacement
        wl_ls = self._world_point(world, 11)
        wl_rs = self._world_point(world, 12)
        wl_mid_sh = (wl_ls + wl_rs) / 2.0
        wl_nose = self._world_point(world, 0)
        wl_ear_l = self._world_point(world, 7)
        wl_ear_r = self._world_point(world, 8)
        wl_mid_ear = (wl_ear_l + wl_ear_r) / 2.0

        forward_z = float(wl_mid_sh[2] - wl_nose[2])
        ear_forward_z = float(wl_mid_sh[2] - wl_mid_ear[2])
        cervical_dy = float(wl_mid_sh[1] - wl_mid_ear[1])
        cervical_angle_deg = float(np.degrees(np.arctan2(ear_forward_z, abs(cervical_dy) + 1e-8)))

        # Head-to-shoulder ratio
        head_shoulder_ratio = float(np.hypot(ear_dx, ear_dy) / (shoulder_width_2d + 1e-8))

        left_arm_valid, left_arm_raised = self._arm_state(normalized, 11, 13, 15, 12, y_scale)
        right_arm_valid, right_arm_raised = self._arm_state(normalized, 12, 14, 16, 11, y_scale)
        is_arm_activity = left_arm_raised or right_arm_raised

        return {
            "upper_shoulder_width": shoulder_width_2d,
            "upper_neck_ratio": neck_ratio,
            "upper_shoulder_roll": shoulder_roll,
            "upper_shoulder_roll_deg": shoulder_roll_deg,
            "upper_head_tilt_deg": head_tilt_deg,
            "upper_head_center_offset": head_center_offset,
            "upper_forward_z": forward_z,
            "upper_ear_forward_z": ear_forward_z,
            "upper_cervical_angle_deg": cervical_angle_deg,
            "upper_head_shoulder_ratio": head_shoulder_ratio,
            "upper_pitch_ratio": pitch_ratio,
            "upper_face_matched": face is not None,
            "upper_is_mendongak": is_mendongak,
            "upper_is_menunduk": is_menunduk,
            "upper_is_arm_activity": is_arm_activity,
            "upper_left_arm_raised": left_arm_raised,
            "upper_right_arm_raised": right_arm_raised,
            "upper_left_arm_valid": left_arm_valid,
            "upper_right_arm_valid": right_arm_valid,
            "upper_is_centered": head_center_offset < 0.12,
        }

    @staticmethod
    def _rejected(reason: str, **extra: Any) -> dict[str, Any]:
        return {
            "status": "rejected",
            "label": None,
            "prediction": "tidak_yakin",
            "reason": reason,
            **extra,
        }

    def extract(self, image_path: str | Path, camera_mode: str = "auto") -> dict[str, Any]:
        image_path = Path(image_path)
        image = self.mp.Image.create_from_file(str(image_path))
        detection = self.detector.detect(image)
        pose_count = len(detection.pose_landmarks)
        if pose_count == 0:
            return self._rejected("Tubuh tidak terdeteksi", pose_count=0)

        # Pilih pose dominan (pengguna utama di depan kamera) dengan scoring cerdas
        best_idx = 0
        if pose_count > 1:
            best_score = -9999.0
            for idx, p_landmarks in enumerate(detection.pose_landmarks):
                score = self._score_pose_candidate(p_landmarks)
                if score > best_score:
                    best_score = score
                    best_idx = idx

        normalized = detection.pose_landmarks[best_idx]
        world = detection.pose_world_landmarks[best_idx]
        try:
            mid_sh_x = float((normalized[11].x + normalized[12].x) / 2.0)
            mid_sh_y = float((normalized[11].y + normalized[12].y) / 2.0)
            self.last_user_center = (mid_sh_x, mid_sh_y)
        except Exception:
            pass

        serialized_landmarks = self._serialize_landmarks(normalized)

        # Check visibilities
        min_upper_visibility = min(
            float(normalized[index].visibility or 0.0) for index in (0, 11, 12)
        )
        min_torso_visibility = min(
            float(normalized[index].visibility or 0.0) for index in (11, 12, 23, 24)
        )
        min_knee_visibility = min(
            float(normalized[index].visibility or 0.0) for index in (25, 26)
        )

        guards = self.config["guards"]
        upper_thresholds = self.config.get("upper_body_thresholds", {})
        min_upper_req = upper_thresholds.get("min_upper_visibility", 0.35)

        # Mode selection: auto, upper_body, or full_torso
        if camera_mode == "auto":
            if (
                min_torso_visibility >= guards["minimum_torso_visibility"]
                and min_knee_visibility >= guards["minimum_knee_visibility"]
            ):
                active_mode = "full_torso"
            else:
                active_mode = "upper_body"
        else:
            active_mode = camera_mode

        if active_mode == "upper_body":
            if min_upper_visibility < min_upper_req:
                return self._rejected(
                    "Kepala atau bahu kurang terlihat di kamera",
                    pose_count=pose_count,
                    min_upper_visibility=min_upper_visibility,
                    landmarks=serialized_landmarks,
                    camera_mode="upper_body",
                )
            face = self._matched_face(image, normalized)
            upper_feats = self._upper_body_features(normalized, world, image.height / image.width, face)
            for idx, keypoint in zip((5, 2), face[:2] if face else ()):
                serialized_landmarks[idx].update(x=keypoint.x, y=keypoint.y, visibility=1.0, faceEye=True)

            return {
                "status": "features_ready",
                "camera_mode": "upper_body",
                "pose_count": pose_count,
                "min_upper_visibility": min_upper_visibility,
                "landmarks": serialized_landmarks,
                **upper_feats,
            }

        # full_torso mode
        if min_torso_visibility < guards["minimum_torso_visibility"]:
            return self._rejected(
                "Bahu atau pinggul kurang terlihat",
                pose_count=pose_count,
                min_torso_visibility=min_torso_visibility,
                min_knee_visibility=min_knee_visibility,
                landmarks=serialized_landmarks,
                camera_mode="full_torso",
            )
        if min_knee_visibility < guards["minimum_knee_visibility"]:
            return self._rejected(
                "Lutut tidak cukup terlihat atau tubuh tertutup",
                pose_count=pose_count,
                min_torso_visibility=min_torso_visibility,
                min_knee_visibility=min_knee_visibility,
                landmarks=serialized_landmarks,
                camera_mode="full_torso",
            )

        left_hip_angle = self._angle(
            self._world_point(world, 11),
            self._world_point(world, 23),
            self._world_point(world, 25),
        )
        right_hip_angle = self._angle(
            self._world_point(world, 12),
            self._world_point(world, 24),
            self._world_point(world, 26),
        )
        mean_hip_angle = float(np.nanmean([left_hip_angle, right_hip_angle]))
        if (
            min_knee_visibility >= guards["standing_knee_visibility"]
            and mean_hip_angle >= guards["standing_hip_angle_degrees"]
        ):
            return self._rejected(
                "Pose terdeteksi berdiri; backend hanya mendukung duduk",
                pose_count=pose_count,
                min_torso_visibility=min_torso_visibility,
                min_knee_visibility=min_knee_visibility,
                mean_hip_angle=mean_hip_angle,
                landmarks=serialized_landmarks,
                camera_mode="full_torso",
            )

        return {
            "status": "features_ready",
            "camera_mode": "full_torso",
            "pose_count": pose_count,
            "min_torso_visibility": min_torso_visibility,
            "min_knee_visibility": min_knee_visibility,
            "mean_hip_angle": mean_hip_angle,
            "landmarks": serialized_landmarks,
            **self._torso_features(world),
            **self._side_alignment_features(normalized, image.width, image.height),
        }

    def detect(self, image_path: str | Path, camera_mode: str = "auto") -> dict[str, Any]:
        """Realtime detection and posture alignment checker for live feedback & countdown."""
        result = self.extract(image_path, camera_mode=camera_mode)
        if result["status"] != "features_ready":
            return result

        mode = result.get("camera_mode", "upper_body")
        if mode == "upper_body":
            roll_deg = result["upper_shoulder_roll_deg"]
            neck = result["upper_neck_ratio"]
            tilt_deg = result["upper_head_tilt_deg"]
            is_centered = result["upper_is_centered"]
            cervical_angle = result["upper_cervical_angle_deg"]
            ear_fwd_z = result["upper_ear_forward_z"]
            nose_fwd_z = result["upper_forward_z"]
            is_mendongak = result["upper_is_mendongak"]
            is_menunduk = result["upper_is_menunduk"]
            is_arm_activity = result["upper_is_arm_activity"]

            upper_th = self.config.get("upper_body_thresholds", {})
            max_cervical = upper_th.get("max_cervical_angle_upright", 14.0)
            max_ear_z = upper_th.get("max_ear_forward_z_upright", 0.045)
            max_nose_z = upper_th.get("max_nose_forward_z_upright", 0.170)

            is_forward_head = (cervical_angle > max_cervical) or (ear_fwd_z > max_ear_z) or (nose_fwd_z > max_nose_z)

            max_roll = upper_th.get("max_shoulder_roll_deg", 8.0)
            min_neck = upper_th.get("min_neck_ratio", 0.35)
            max_head_tilt = upper_th.get("max_head_tilt_relative_deg", 12.0)

            is_upright = (
                (roll_deg <= max_roll)
                and (neck >= min_neck)
                and (tilt_deg <= max_head_tilt)
                and is_centered
                and not is_forward_head
                and not is_mendongak
                and not is_menunduk
                and not is_arm_activity
            )

            feedback_parts = []
            if is_arm_activity:
                feedback_parts.append("Turunkan kedua tangan ke posisi santai untuk kalibrasi")
            elif is_mendongak:
                feedback_parts.append("Turunkan dagu, pandangan lurus sejajar layar (Jangan mendongak ke atas)")
            elif is_menunduk:
                feedback_parts.append("Tegakkan pandangan ke depan, jangan menunduk")
            elif is_forward_head:
                feedback_parts.append("Tarik kepala/dagu ke belakang sejajar bahu (Kepala terlalu maju)")

            if roll_deg > max_roll:
                feedback_parts.append("Sejajarkan tinggi bahu kanan dan kiri")
            if neck < min_neck and not is_menunduk:
                feedback_parts.append("Tegakkan leher")
            if tilt_deg > max_head_tilt:
                feedback_parts.append("Tegakkan posisi kepala lurus")
            if not is_centered:
                feedback_parts.append("Posisikan kepala di tengah frame")

            feedback = "Posisi tegak dan seimbang! Siap kalibrasi." if is_upright else " & ".join(feedback_parts)
        else:
            lean = result.get("v2_torso_lean_deg", 0.0)
            roll = result.get("v2_shoulder_roll_deg", 0.0)
            side_cfg = self.config.get("side_alignment", {})
            neck_forward = (
                result.get("side_neck_available", False)
                and result["side_neck_flexion_deg"] > side_cfg.get("max_neck_flexion_deg", 40.0)
            )
            if result.get("side_alignment_available", False):
                limit = side_cfg.get("max_torso_lean_deg", 15.0)
                is_upright = result["side_torso_lean_deg"] <= limit and not neck_forward
            else:
                is_upright = (lean < 12.0) and (roll < 9.0)
            # Cegah kalibrasi saat kepala sudah maju: baseline bungkuk membuat bungkuk berikutnya tak terdeteksi
            if is_upright:
                feedback = "Posisi siap. Pertahankan duduk nyaman untuk kalibrasi."
            elif neck_forward:
                feedback = "Tarik kepala ke belakang hingga telinga sejajar bahu, lalu coba lagi."
            else:
                feedback = "Duduk lebih tegak dan pastikan kamera sejajar, lalu coba lagi."

        result.update({
            "status": "ok",
            "is_upright": is_upright,
            "alignment_feedback": feedback,
        })
        return result

    def calibrate(
        self,
        upright_image_paths: Iterable[str | Path],
        camera_mode: str = "auto",
    ) -> dict[str, Any]:
        paths = list(upright_image_paths)
        samples = []
        rejected = []

        resolved_mode = camera_mode
        for image_path in paths:
            result = self.extract(image_path, camera_mode=resolved_mode)
            if result["status"] == "features_ready":
                if resolved_mode == "auto":
                    resolved_mode = result["camera_mode"]
                samples.append(result)
            else:
                rejected.append({"image": str(image_path), "reason": result.get("reason", "Ditolak")})

        minimum = int(self.config["calibration"]["minimum_images"])
        if len(samples) < minimum:
            raise ValueError(
                f"Kalibrasi membutuhkan minimal {minimum} foto tegak valid; "
                f"hanya {len(samples)} yang valid"
            )

        if resolved_mode == "upper_body":
            baseline_neck = float(np.median([s["upper_neck_ratio"] for s in samples]))
            baseline_forward_z = float(np.median([s["upper_forward_z"] for s in samples]))
            baseline_ear_z = float(np.median([s["upper_ear_forward_z"] for s in samples]))
            baseline_cervical = float(np.median([s["upper_cervical_angle_deg"] for s in samples]))
            baseline_roll = float(np.median([s["upper_shoulder_roll"] for s in samples]))
            face_pitches = [s["upper_pitch_ratio"] for s in samples if s["upper_face_matched"]]
            baseline_pitch = float(np.median(face_pitches)) if face_pitches else 1.0
            return {
                "camera_mode": "upper_body",
                "baseline_neck_ratio": baseline_neck,
                "baseline_forward_z": baseline_forward_z,
                "baseline_ear_forward_z": baseline_ear_z,
                "baseline_cervical_angle": baseline_cervical,
                "baseline_shoulder_roll": baseline_roll,
                "baseline_pitch_ratio": baseline_pitch,
                "pitch_source": "face_detector",
                "forward_baseline": baseline_forward_z,  # compatibility
                "valid_samples": len(samples),
                "rejected_samples": rejected,
            }

        # full_torso mode
        forward_baseline = float(np.median([s["v2_torso_forward_ratio"] for s in samples]))
        necks = [s["side_neck_flexion_deg"] for s in samples if s.get("side_neck_available")]
        torsos = [s["side_torso_forward_deg"] for s in samples if s.get("side_alignment_available")]
        return {
            "camera_mode": "full_torso",
            "forward_baseline": forward_baseline,
            "baseline_side_neck_flexion": float(np.median(necks)) if necks else None,
            "baseline_side_torso_forward": float(np.median(torsos)) if torsos else None,
            "valid_samples": len(samples),
            "rejected_samples": rejected,
        }

    @staticmethod
    def _side_view_label(
        result: dict[str, Any], calibration: dict[str, Any], thresholds: dict[str, Any]
    ) -> tuple[int, str | None]:
        """Label tambahan kamera samping: 1 = condong depan, 2 = bersandar, 0 = tegak."""
        if result.get("side_alignment_available"):
            base_torso = calibration.get("baseline_side_torso_forward")
            if base_torso is not None:
                torso_delta = result["side_torso_forward_deg"] - float(base_torso)
                if torso_delta >= thresholds.get("side_torso_forward_delta_deg", 12.0):
                    return 1, "torso_forward"
                if torso_delta <= thresholds.get("side_torso_backward_delta_deg", -12.0):
                    return 2, "torso_backward"

        if result.get("side_neck_available"):
            neck = result["side_neck_flexion_deg"]
            if neck >= thresholds.get("side_neck_flexion_max_deg", 45.0):
                return 1, "head_forward"
            base_neck = calibration.get("baseline_side_neck_flexion")
            if base_neck is not None and neck - float(base_neck) >= thresholds.get("side_neck_flexion_delta_deg", 15.0):
                return 1, "head_forward"
        return 0, None

    def predict(self, image_path: str | Path, calibration: dict[str, Any]) -> dict[str, Any]:
        mode = calibration.get("camera_mode")
        if mode is None:
            mode = "upper_body" if "baseline_neck_ratio" in calibration else "full_torso"

        result = self.extract(image_path, camera_mode=mode)
        if result["status"] != "features_ready":
            return result

        labels = self.config["labels"]

        if mode == "upper_body":
            base_neck = float(calibration["baseline_neck_ratio"])
            base_z = float(calibration["baseline_forward_z"])
            base_ear_z = float(calibration.get("baseline_ear_forward_z", 0.02))
            base_cervical = float(calibration.get("baseline_cervical_angle", 7.0))
            base_pitch = calibration.get("baseline_pitch_ratio", 1.0) if calibration.get("pitch_source") == "face_detector" else 1.0

            cur_neck = result["upper_neck_ratio"]
            cur_z = result["upper_forward_z"]
            cur_ear_z = result["upper_ear_forward_z"]
            cur_cervical = result["upper_cervical_angle_deg"]
            cur_pitch = result["upper_pitch_ratio"] / max(base_pitch, 1e-5) if result["upper_face_matched"] else 1.0

            neck_drop = (cur_neck - base_neck) / (base_neck + 1e-6)
            z_delta = cur_z - base_z
            ear_z_delta = cur_ear_z - base_ear_z
            cervical_delta = cur_cervical - base_cervical
            upper_th = self.config.get("upper_body_thresholds", {})

            # Reclining / Leaning back / Mendongak ke atas
            is_backward = (
                (cur_pitch < 0.78)        # mendongak ke atas
                or (cervical_delta < -5.0 and ear_z_delta < -0.035)
                or (neck_drop > 0.16 and z_delta < -0.05 and cur_cervical < 12.0)
            )

            # Slouching / Forward head / Menunduk
            # Allows moderate neck flexion (up to ~21 deg) when shoulders are level and chest is upright (e.g. glancing at phone / keyboard)
            is_forward = (
                (neck_drop < -0.14)
                or (cervical_delta > 14.0)
                or (ear_z_delta > 0.045)
                or (z_delta > 0.065)
                or (cur_cervical > 21.5)  # absolute forward limit (severe turtle neck)
                or (cur_ear_z > 0.068)    # absolute ear displacement limit
                or (cur_pitch > 1.28)     # menunduk drastis
            )

            is_head_activity = self._is_head_activity(
                pitch_ratio=cur_pitch,
                head_center_offset=result["upper_head_center_offset"],
                shoulder_roll_deg=result["upper_shoulder_roll_deg"],
                neck_drop=neck_drop,
                z_delta=z_delta,
                ear_z_delta=ear_z_delta,
                thresholds=upper_th,
            )
            if is_head_activity:
                is_forward = False
                is_backward = False

            # Arm activity tolerance (scratching head, stretching arm)
            # If arms are raised but head gaze & pitch remain level, do not penalize as slouch
            is_arm_activity = result.get("upper_is_arm_activity", False)
            if is_arm_activity and 0.78 <= cur_pitch <= 1.28:
                is_forward = False
                is_backward = False

            if is_backward:
                label = 2  # condong_belakang
            elif is_forward:
                label = 1  # condong_depan
            else:
                label = 0  # tegak

            result.update({
                "status": "ok",
                "label": label,
                "prediction": labels[str(label)],
                "neck_drop_ratio": float(neck_drop),
                "pitch_ratio": float(cur_pitch),
                "upper_is_mendongak": cur_pitch < 0.78,
                "upper_is_menunduk": cur_pitch > 1.28,
                "cervical_angle_deg": float(cur_cervical),
                "cervical_delta": float(cervical_delta),
                "ear_z_delta": float(ear_z_delta),
                "z_delta": float(z_delta),
                "shoulder_roll_deg": float(result["upper_shoulder_roll_deg"]),
                "upper_is_head_activity": is_head_activity,
                "confidence": None,
                "confidence_note": "Klasifikasi berbasis geometri keypoint, sudut servikal, dan pitch wajah",
            })
            return result

        # full_torso mode (V3 logic)
        thresholds = self.config["thresholds"]
        delta = (
            result["v2_torso_forward_ratio"]
            - float(calibration["forward_baseline"])
        )
        if delta < thresholds["backward_delta_max"]:
            label = 2
        elif (
            delta > thresholds["forward_delta_high"]
            or (
                delta > thresholds["forward_delta_low"]
                and result["v2_torso_vertical_ratio"]
                < thresholds["forward_vertical_guard"]
            )
        ):
            label = 1
        else:
            label = 0

        # Lapisan 2D kamera samping (koordinat piksel, lebih stabil dari kedalaman 3D kamera HP):
        # torso condong/bersandar relatif kalibrasi, dan kepala maju (forward head) absolut/relatif.
        side_reason = None
        if label == 0:
            label, side_reason = self._side_view_label(result, calibration, thresholds)

        result.update({
            "status": "ok",
            "label": label,
            "prediction": labels[str(label)],
            "side_reason": side_reason,
            "forward_delta": float(delta),
            "decision_margin": float(min(
                abs(delta - thresholds["backward_delta_max"]),
                abs(delta - thresholds["forward_delta_low"]),
                abs(delta - thresholds["forward_delta_high"]),
            )),
            "confidence": None,
            "confidence_note": "decision_margin, bukan probabilitas",
        })
        return result
