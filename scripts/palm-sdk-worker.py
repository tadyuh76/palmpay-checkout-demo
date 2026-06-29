import argparse
import base64
import ctypes
import io
import json
import os
import re
import sys
import threading
import time
from collections import deque
from pathlib import Path

try:
    from PIL import Image
except Exception as exc:  # pragma: no cover - reported to the Next.js route.
    Image = None
    PIL_IMPORT_ERROR = exc
else:
    PIL_IMPORT_ERROR = None


PV_OK = 0
PV_ERR_LOW_QUALITY = -38
XR_VEIN_FEATURE_INFO_SIZE = 1036
XR_VEIN_THRESH = 0.95

COLOR_H264 = 1
COLOR_MJPG = 2
COLOR_YUY2 = 3
COLOR_Y8 = 4

CRC16_CCIT_TAB = [
    0x0000, 0x1189, 0x2312, 0x329B, 0x4624, 0x57AD, 0x6536, 0x74BF,
    0x8C48, 0x9DC1, 0xAF5A, 0xBED3, 0xCA6C, 0xDBE5, 0xE97E, 0xF8F7,
    0x1081, 0x0108, 0x3393, 0x221A, 0x56A5, 0x472C, 0x75B7, 0x643E,
    0x9CC9, 0x8D40, 0xBFDB, 0xAE52, 0xDAED, 0xCB64, 0xF9FF, 0xE876,
    0x2102, 0x308B, 0x0210, 0x1399, 0x6726, 0x76AF, 0x4434, 0x55BD,
    0xAD4A, 0xBCC3, 0x8E58, 0x9FD1, 0xEB6E, 0xFAE7, 0xC87C, 0xD9F5,
    0x3183, 0x200A, 0x1291, 0x0318, 0x77A7, 0x662E, 0x54B5, 0x453C,
    0xBDCB, 0xAC42, 0x9ED9, 0x8F50, 0xFBEF, 0xEA66, 0xD8FD, 0xC974,
    0x4204, 0x538D, 0x6116, 0x709F, 0x0420, 0x15A9, 0x2732, 0x36BB,
    0xCE4C, 0xDFC5, 0xED5E, 0xFCD7, 0x8868, 0x99E1, 0xAB7A, 0xBAF3,
    0x5285, 0x430C, 0x7197, 0x601E, 0x14A1, 0x0528, 0x37B3, 0x263A,
    0xDECD, 0xCF44, 0xFDDF, 0xEC56, 0x98E9, 0x8960, 0xBBFB, 0xAA72,
    0x6306, 0x728F, 0x4014, 0x519D, 0x2522, 0x34AB, 0x0630, 0x17B9,
    0xEF4E, 0xFEC7, 0xCC5C, 0xDDD5, 0xA96A, 0xB8E3, 0x8A78, 0x9BF1,
    0x7387, 0x620E, 0x5095, 0x411C, 0x35A3, 0x242A, 0x16B1, 0x0738,
    0xFFCF, 0xEE46, 0xDCDD, 0xCD54, 0xB9EB, 0xA862, 0x9AF9, 0x8B70,
    0x8408, 0x9581, 0xA71A, 0xB693, 0xC22C, 0xD3A5, 0xE13E, 0xF0B7,
    0x0840, 0x19C9, 0x2B52, 0x3ADB, 0x4E64, 0x5FED, 0x6D76, 0x7CFF,
    0x9489, 0x8500, 0xB79B, 0xA612, 0xD2AD, 0xC324, 0xF1BF, 0xE036,
    0x18C1, 0x0948, 0x3BD3, 0x2A5A, 0x5EE5, 0x4F6C, 0x7DF7, 0x6C7E,
    0xA50A, 0xB483, 0x8618, 0x9791, 0xE32E, 0xF2A7, 0xC03C, 0xD1B5,
    0x2942, 0x38CB, 0x0A50, 0x1BD9, 0x6F66, 0x7EEF, 0x4C74, 0x5DFD,
    0xB58B, 0xA402, 0x9699, 0x8710, 0xF3AF, 0xE226, 0xD0BD, 0xC134,
    0x39C3, 0x284A, 0x1AD1, 0x0B58, 0x7FE7, 0x6E6E, 0x5CF5, 0x4D7C,
    0xC60C, 0xD785, 0xE51E, 0xF497, 0x8028, 0x91A1, 0xA33A, 0xB2B3,
    0x4A44, 0x5BCD, 0x6956, 0x78DF, 0x0C60, 0x1DE9, 0x2F72, 0x3EFB,
    0xD68D, 0xC704, 0xF59F, 0xE416, 0x90A9, 0x8120, 0xB3BB, 0xA232,
    0x5AC5, 0x4B4C, 0x79D7, 0x685E, 0x1CE1, 0x0D68, 0x3FF3, 0x2E7A,
    0xE70E, 0xF687, 0xC41C, 0xD595, 0xA12A, 0xB0A3, 0x8238, 0x93B1,
    0x6B46, 0x7ACF, 0x4854, 0x59DD, 0x2D62, 0x3CEB, 0x0E70, 0x1FF9,
    0xF78F, 0xE606, 0xD49D, 0xC514, 0xB1AB, 0xA022, 0x92B9, 0x8330,
    0x7BC7, 0x6A4E, 0x58D5, 0x495C, 0x3DE3, 0x2C6A, 0x1EF1, 0x0F78,
]


class Guid(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_ulong),
        ("Data2", ctypes.c_ushort),
        ("Data3", ctypes.c_ushort),
        ("Data4", ctypes.c_ubyte * 8),
    ]


class ScDevice(ctypes.Structure):
    _fields_ = [
        ("chipID", ctypes.c_ubyte),
        ("devName", ctypes.c_wchar * 256),
        ("devPath", ctypes.c_wchar * 256),
        ("devLocation", ctypes.c_wchar * 50),
    ]


class ScVideoOutFormat(ctypes.Structure):
    _fields_ = [
        ("width", ctypes.c_uint),
        ("height", ctypes.c_uint),
        ("colorSpace", ctypes.c_int),
        ("mediaSubType", Guid),
    ]


class SPalmInfo(ctypes.Structure):
    _fields_ = [
        ("status", ctypes.c_uint8),
        ("palm_bright", ctypes.c_uint8),
        ("x", ctypes.c_uint16),
        ("y", ctypes.c_uint32),
        ("width", ctypes.c_uint16),
        ("height", ctypes.c_uint16),
    ]


CallbackFactory = getattr(ctypes, "WINFUNCTYPE", ctypes.CFUNCTYPE)
SampleGrabberCB = CallbackFactory(
    ctypes.c_int,
    ctypes.c_double,
    ctypes.POINTER(ctypes.c_ubyte),
    ctypes.c_uint,
    ctypes.c_void_p,
)


def log(message, **metadata):
    payload = f"[palm-sdk] {message}"
    if metadata:
        payload += " " + json.dumps(metadata, ensure_ascii=True, sort_keys=True)
    print(payload, file=sys.stderr, flush=True)


def emit(result):
    print(json.dumps(result, ensure_ascii=True), flush=True)


def emit_stream(stream_type, result):
    payload = dict(result)
    payload["streamType"] = stream_type
    print(json.dumps(payload, ensure_ascii=True), flush=True)


def sanitize_template_ref(value):
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", value.strip())
    return cleaned[:120] or "template"


def template_path(templates_dir, template_ref):
    return Path(templates_dir) / f"{sanitize_template_ref(template_ref)}.bin"


def crc16_ccitt_reflected(data):
    crc = 0
    for byte in data:
        crc = (crc >> 8) ^ CRC16_CCIT_TAB[(crc ^ byte) & 0xFF]
    return crc & 0xFFFF


def rotate_gray_ccw(gray, width, height):
    new_width = height
    new_height = width
    dst = bytearray(width * height)
    for y in range(height):
        row = y * width
        new_x = height - 1 - y
        for x in range(width):
            new_y = x
            dst[new_y * new_width + new_x] = gray[row + x]
    return bytes(dst), new_width, new_height


class PalmSdk:
    def __init__(self, sdk_dir):
        self.sdk_dir = Path(sdk_dir)
        if not self.sdk_dir.exists():
            raise RuntimeError(f"SDK directory does not exist: {self.sdk_dir}")
        if PIL_IMPORT_ERROR is not None:
            raise RuntimeError(f"Pillow is required to decode camera frames: {PIL_IMPORT_ERROR}")

        os.add_dll_directory(str(self.sdk_dir))
        loader = getattr(ctypes, "WinDLL", ctypes.CDLL)
        self.sonix = loader(str(self.sdk_dir / "SonixCamera.dll"))
        self.vein = loader(str(self.sdk_dir / "XRCommonVeinAlgAPI.dll"))

        self.dev = None
        self.dev_ptr = None
        self.alg_handle = ctypes.c_void_p()
        self.callback = None
        self.frame_event = threading.Event()
        self.frame_lock = threading.Lock()
        self.frames = deque(maxlen=4)
        self.frames_seen = 0
        self.preview_format = ScVideoOutFormat()
        self.sdk_version = ""
        self._last_preview_emit = 0
        self._configure_functions()

    def _configure_functions(self):
        self.sonix.SonixCam_Init.restype = ctypes.c_bool
        self.sonix.SonixCam_UnInit.restype = ctypes.c_bool
        self.sonix.SonixCam_EnumCameras.argtypes = [
            ctypes.POINTER(ctypes.c_uint),
            ctypes.POINTER(ScDevice),
            ctypes.c_uint,
        ]
        self.sonix.SonixCam_EnumCameras.restype = ctypes.c_bool
        self.sonix.SonixCam_OpenCamera.argtypes = [
            ctypes.POINTER(ScDevice),
            ctypes.c_void_p,
            SampleGrabberCB,
            ctypes.c_void_p,
        ]
        self.sonix.SonixCam_OpenCamera.restype = ctypes.c_bool
        self.sonix.SonixCam_CloseCamera.argtypes = [ctypes.POINTER(ScDevice)]
        self.sonix.SonixCam_CloseCamera.restype = ctypes.c_bool
        self.sonix.SonixCam_StopPreview.argtypes = [ctypes.POINTER(ScDevice)]
        self.sonix.SonixCam_StopPreview.restype = ctypes.c_bool
        self.sonix.SonixCam_StartPreview.argtypes = [ctypes.POINTER(ScDevice)]
        self.sonix.SonixCam_StartPreview.restype = ctypes.c_bool
        self.sonix.SonixCam_IsOpened.argtypes = [ctypes.POINTER(ScDevice)]
        self.sonix.SonixCam_IsOpened.restype = ctypes.c_bool
        self.sonix.SonixCam_IsPreviewing.argtypes = [ctypes.POINTER(ScDevice)]
        self.sonix.SonixCam_IsPreviewing.restype = ctypes.c_bool
        self.sonix.SonixCam_GetFormatCount.argtypes = [
            ctypes.POINTER(ScDevice),
            ctypes.POINTER(ctypes.c_uint),
        ]
        self.sonix.SonixCam_GetFormatCount.restype = ctypes.c_bool
        self.sonix.SonixCam_GetFormat.argtypes = [
            ctypes.POINTER(ScDevice),
            ctypes.c_ubyte,
            ctypes.POINTER(ScVideoOutFormat),
        ]
        self.sonix.SonixCam_GetFormat.restype = ctypes.c_bool
        self.sonix.SonixCam_GetPreviewFormat.argtypes = [
            ctypes.POINTER(ScDevice),
            ctypes.POINTER(ScVideoOutFormat),
        ]
        self.sonix.SonixCam_GetPreviewFormat.restype = ctypes.c_bool
        self.sonix.SonixCam_SetPreviewFormat.argtypes = [
            ctypes.POINTER(ScDevice),
            ctypes.c_uint,
            ctypes.c_void_p,
        ]
        self.sonix.SonixCam_SetPreviewFormat.restype = ctypes.c_bool
        self.sonix.SonixCam_AsicRegisterRead.argtypes = [
            ctypes.POINTER(ScDevice),
            ctypes.c_ushort,
            ctypes.c_void_p,
            ctypes.c_uint,
        ]
        self.sonix.SonixCam_AsicRegisterRead.restype = ctypes.c_bool
        self.sonix.SonixCam_AsicRegisterWrite.argtypes = [
            ctypes.POINTER(ScDevice),
            ctypes.c_ushort,
            ctypes.c_void_p,
            ctypes.c_uint,
        ]
        self.sonix.SonixCam_AsicRegisterWrite.restype = ctypes.c_bool

        self.vein.XR_Vein_GetVersion.argtypes = [
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_int),
        ]
        self.vein.XR_Vein_GetVersion.restype = ctypes.c_int
        self.vein.XR_Vein_Init.argtypes = [ctypes.POINTER(ctypes.c_void_p)]
        self.vein.XR_Vein_Init.restype = ctypes.c_int
        self.vein.XR_Vein_DeInit.argtypes = [ctypes.c_void_p]
        self.vein.XR_Vein_DeInit.restype = ctypes.c_int
        self.vein.XR_Vein_GetLicCode.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_uint8),
            ctypes.POINTER(ctypes.c_int),
        ]
        self.vein.XR_Vein_GetLicCode.restype = ctypes.c_int
        self.vein.XR_Vein_ActivateVeinSDK.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_int,
        ]
        self.vein.XR_Vein_ActivateVeinSDK.restype = ctypes.c_int
        self.vein.XR_Vein_InitEnrollEnv.argtypes = [ctypes.c_void_p]
        self.vein.XR_Vein_InitEnrollEnv.restype = ctypes.c_int
        self.vein.XR_Vein_TryEnroll.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(SPalmInfo),
            ctypes.POINTER(ctypes.c_uint8),
        ]
        self.vein.XR_Vein_TryEnroll.restype = ctypes.c_int
        self.vein.XR_Vein_FinishEnroll.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_int),
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_int),
        ]
        self.vein.XR_Vein_FinishEnroll.restype = ctypes.c_int
        self.vein.XR_Vein_GrabFeatureFromFullImg.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(SPalmInfo),
            ctypes.POINTER(ctypes.c_uint8),
        ]
        self.vein.XR_Vein_GrabFeatureFromFullImg.restype = ctypes.c_int
        self.vein.XR_Vein_CalcFeatureDist.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.POINTER(ctypes.c_float),
        ]
        self.vein.XR_Vein_CalcFeatureDist.restype = ctypes.c_int

    def initialize(self, device_index):
        if not self.sonix.SonixCam_Init():
            raise RuntimeError("SonixCam_Init failed")

        count = ctypes.c_uint(0)
        devs = (ScDevice * 10)()
        if not self.sonix.SonixCam_EnumCameras(ctypes.byref(count), devs, 10):
            raise RuntimeError("SonixCam_EnumCameras failed")
        if count.value <= device_index:
            raise RuntimeError(f"No palm camera at index {device_index}; found {count.value}")

        self.dev = devs[device_index]
        self.dev_ptr = ctypes.pointer(self.dev)
        log("device selected", name=self.dev.devName, location=self.dev.devLocation)

        @SampleGrabberCB
        def sample_callback(sample_time, buffer, buffer_size, ptr_class):
            try:
                data = ctypes.string_at(buffer, int(buffer_size))
                with self.frame_lock:
                    self.frames.append(data)
                    self.frames_seen += 1
                self.frame_event.set()
            except Exception as exc:
                log("frame callback failed", error=str(exc))
            return 1

        self.callback = sample_callback
        if not self.sonix.SonixCam_OpenCamera(self.dev_ptr, None, self.callback, None):
            raise RuntimeError("SonixCam_OpenCamera failed")

        self._activate_algorithm()
        self._select_preview_format()

        if not self.sonix.SonixCam_StartPreview(self.dev_ptr):
            raise RuntimeError("SonixCam_StartPreview failed")

        self.sonix.SonixCam_GetPreviewFormat(self.dev_ptr, ctypes.byref(self.preview_format))
        log(
            "preview started",
            width=int(self.preview_format.width),
            height=int(self.preview_format.height),
            colorSpace=int(self.preview_format.colorSpace),
        )

    def _select_preview_format(self):
        count = ctypes.c_uint(0)
        if not self.sonix.SonixCam_GetFormatCount(self.dev_ptr, ctypes.byref(count)):
            log("format count unavailable")
            return
        best_index = None
        best_area = -1
        best_format = None
        for index in range(count.value):
            fmt = ScVideoOutFormat()
            if not self.sonix.SonixCam_GetFormat(self.dev_ptr, index, ctypes.byref(fmt)):
                continue
            area = int(fmt.width) * int(fmt.height)
            mjpg_bonus = 10_000_000 if int(fmt.colorSpace) == COLOR_MJPG else 0
            score = area + mjpg_bonus
            if score > best_area:
                best_area = score
                best_index = index
                best_format = fmt
        if best_index is not None:
            ok = self.sonix.SonixCam_SetPreviewFormat(self.dev_ptr, best_index, None)
            log(
                "preview format selected",
                ok=bool(ok),
                index=best_index,
                width=int(best_format.width),
                height=int(best_format.height),
                colorSpace=int(best_format.colorSpace),
            )

    def _activate_algorithm(self):
        version = ctypes.create_string_buffer(64)
        version_len = ctypes.c_int(64)
        ret = self.vein.XR_Vein_GetVersion(version, ctypes.byref(version_len))
        if ret == PV_OK:
            self.sdk_version = version.value.decode("utf-8", errors="replace")
            log("vein sdk version", version=self.sdk_version)

        ret = self.vein.XR_Vein_Init(ctypes.byref(self.alg_handle))
        if ret != PV_OK:
            raise RuntimeError(f"XR_Vein_Init failed: {ret}")

        lic_buf = (ctypes.c_uint8 * 256)()
        lic_len = ctypes.c_int(256)
        ret = self.vein.XR_Vein_GetLicCode(self.alg_handle, lic_buf, ctypes.byref(lic_len))
        if ret != PV_OK:
            raise RuntimeError(f"XR_Vein_GetLicCode failed: {ret}")

        activation_code = self._chip_sm2_decrypt(bytes(lic_buf[: lic_len.value]))
        act_buf = ctypes.create_string_buffer(activation_code)
        ret = self.vein.XR_Vein_ActivateVeinSDK(
            self.alg_handle,
            ctypes.cast(act_buf, ctypes.c_void_p),
            len(activation_code),
        )
        if ret != PV_OK:
            raise RuntimeError(f"XR_Vein_ActivateVeinSDK failed: {ret}")
        log("vein sdk activated")

    def _send_data(self, payload):
        time.sleep(0.1)
        trig = ctypes.c_ubyte(0)
        length = ctypes.c_ubyte(len(payload) & 0xFF)
        if not self.sonix.SonixCam_AsicRegisterRead(self.dev_ptr, 0x0B07, ctypes.byref(trig), 1):
            return -44
        if not self.sonix.SonixCam_AsicRegisterWrite(self.dev_ptr, 0x0B06, ctypes.byref(length), 1):
            return -44
        data = (ctypes.c_ubyte * len(payload)).from_buffer_copy(payload)
        if not self.sonix.SonixCam_AsicRegisterWrite(self.dev_ptr, 0x0B08, data, length.value):
            return -44
        trig = ctypes.c_ubyte(0)
        if not self.sonix.SonixCam_AsicRegisterWrite(self.dev_ptr, 0x0B07, ctypes.byref(trig), 1):
            return -44
        time.sleep(0.1)
        return PV_OK

    def _recv_data(self, length):
        time.sleep(0.1)
        trig = ctypes.c_ubyte(0)
        data_len = ctypes.c_ubyte(length & 0xFF)
        if not self.sonix.SonixCam_AsicRegisterRead(self.dev_ptr, 0x0B07, ctypes.byref(trig), 1):
            raise RuntimeError("read trigger flag failed")
        if not self.sonix.SonixCam_AsicRegisterWrite(self.dev_ptr, 0x0B06, ctypes.byref(data_len), 1):
            raise RuntimeError("write receive length failed")
        trig = ctypes.c_ubyte(1)
        if not self.sonix.SonixCam_AsicRegisterWrite(self.dev_ptr, 0x0B07, ctypes.byref(trig), 1):
            raise RuntimeError("start receive failed")
        time.sleep(0.2)
        buf = (ctypes.c_ubyte * data_len.value)()
        if not self.sonix.SonixCam_AsicRegisterRead(self.dev_ptr, 0x0B08, buf, data_len.value):
            raise RuntimeError("read receive buffer failed")
        return bytes(buf)

    def _chip_sm2_decrypt(self, lic_code, out_len=16):
        if len(lic_code) < 97 or len(lic_code) > 246:
            raise RuntimeError(f"invalid license code length: {len(lic_code)}")
        cmd_len = len(lic_code) + 5
        send = bytearray(len(lic_code) + 10)
        send[0] = 0
        send[1] = (cmd_len >> 8) & 0xFF
        send[2] = cmd_len & 0xFF
        send[3] = 0
        send[4] = 0xE1
        send[5] = 1
        send[6] = (len(lic_code) >> 8) & 0xFF
        send[7] = len(lic_code) & 0xFF
        send[8 : 8 + len(lic_code)] = lic_code
        crc = crc16_ccitt_reflected(send[3 : 3 + cmd_len])
        send[len(lic_code) + 8] = (crc >> 8) & 0xFF
        send[len(lic_code) + 9] = crc & 0xFF

        ret = self._send_data(bytes(send))
        if ret != PV_OK:
            raise RuntimeError(f"chip decrypt send failed: {ret}")
        recv = self._recv_data(out_len + 7)
        if len(recv) < out_len + 3:
            raise RuntimeError("chip decrypt response too short")
        return recv[3 : 3 + out_len]

    def _decode_frame(self, frame):
        width = int(self.preview_format.width)
        height = int(self.preview_format.height)
        color = int(self.preview_format.colorSpace)

        if color == COLOR_Y8 and width and height and len(frame) >= width * height:
            return frame[: width * height], width, height

        if color == COLOR_YUY2 and width and height and len(frame) >= width * height * 2:
            return frame[: width * height * 2 : 2], width, height

        image = Image.open(io.BytesIO(frame)).convert("L")
        width, height = image.size
        return image.tobytes(), width, height

    def next_gray_frame(self, deadline):
        while time.time() < deadline:
            remaining = max(0.05, min(0.5, deadline - time.time()))
            self.frame_event.wait(remaining)
            with self.frame_lock:
                frame = self.frames.popleft() if self.frames else None
                if not self.frames:
                    self.frame_event.clear()
            if not frame:
                continue
            try:
                gray, width, height = self._decode_frame(frame)
                if height > width:
                    rotated, rotated_width, rotated_height = rotate_gray_ccw(gray, width, height)
                    return rotated, rotated_width, rotated_height
                return gray, width, height
            except Exception as exc:
                log("frame decode skipped", error=str(exc))
        raise TimeoutError("timed out waiting for a camera frame")

    def _scan_payload(self, action, gray, width, height, ret, cap_tip, palm_info, high_bright, **metadata):
        payload = {
            "action": action,
            "attempts": metadata.pop("attempts", None),
            "capTip": cap_tip,
            "framesSeen": self.frames_seen,
            "highBright": int(high_bright),
            "imageHeight": height,
            "imageWidth": width,
            "palmBox": {
                "height": int(palm_info.height),
                "status": int(palm_info.status),
                "width": int(palm_info.width),
                "x": int(palm_info.x),
                "y": int(palm_info.y),
            },
            "palmBright": int(palm_info.palm_bright),
            "palmStatus": int(palm_info.status),
            "sdkReturn": ret,
            **metadata,
        }

        try:
            preview = Image.frombytes("L", (width, height), gray)
            resample = getattr(getattr(Image, "Resampling", Image), "BILINEAR")
            preview.thumbnail((640, 360), resample)
            preview_buffer = io.BytesIO()
            preview.save(preview_buffer, format="JPEG", quality=70, optimize=True)
            payload.update(
                {
                    "previewHeight": preview.height,
                    "previewImage": "data:image/jpeg;base64,"
                    + base64.b64encode(preview_buffer.getvalue()).decode("ascii"),
                    "previewWidth": preview.width,
                }
            )
        except Exception as exc:
            payload["previewError"] = str(exc)

        return payload

    def _maybe_emit_scan(self, stream_events, payload, force=False):
        if not stream_events:
            return
        now = time.time()
        if force or now - self._last_preview_emit >= 0.35:
            self._last_preview_emit = now
            emit_stream("scan", payload)

    def enroll(self, template_ref, templates_dir, timeout_sec, stream_events=False):
        ret = self.vein.XR_Vein_InitEnrollEnv(self.alg_handle)
        if ret != PV_OK:
            raise RuntimeError(f"XR_Vein_InitEnrollEnv failed: {ret}")

        deadline = time.time() + timeout_sec
        enroll_step = ctypes.c_int(0)
        attempts = 0
        last_ret = None
        last_tip = None
        last_palm = None
        last_payload = None

        while time.time() < deadline and enroll_step.value < 3:
            gray, width, height = self.next_gray_frame(deadline)
            attempts += 1
            img = (ctypes.c_uint8 * len(gray)).from_buffer_copy(gray)
            cap_tip = ctypes.c_int(0)
            palm_info = SPalmInfo()
            high_bright = ctypes.c_uint8(0)
            previous_ret = last_ret
            ret = self.vein.XR_Vein_TryEnroll(
                self.alg_handle,
                ctypes.cast(img, ctypes.c_void_p),
                height,
                width,
                1,
                ctypes.byref(enroll_step),
                ctypes.byref(cap_tip),
                ctypes.byref(palm_info),
                ctypes.byref(high_bright),
            )
            last_ret = ret
            last_tip = cap_tip.value
            last_palm = palm_info
            last_payload = self._scan_payload(
                "enroll",
                gray,
                width,
                height,
                ret,
                cap_tip.value,
                palm_info,
                high_bright.value,
                attempts=attempts,
                sampleCount=enroll_step.value,
                sampleGoal=3,
            )
            self._maybe_emit_scan(
                stream_events,
                last_payload,
                force=ret == PV_OK or attempts <= 3,
            )
            if ret == PV_OK or attempts <= 5 or ret != previous_ret or attempts % 15 == 0:
                log(
                    "enroll attempt",
                    attempt=attempts,
                    ret=ret,
                    enrollStep=enroll_step.value,
                    capTip=cap_tip.value,
                    palmStatus=palm_info.status,
                    width=width,
                    height=height,
                )
            if ret == PV_OK and enroll_step.value >= 3:
                break

        if enroll_step.value < 3:
            result = {
                "ok": False,
                "action": "enroll",
                "error": "enroll_incomplete",
                "sdkReturn": last_ret,
                "capTip": last_tip,
                "sampleCount": enroll_step.value,
                "attempts": attempts,
                "framesSeen": self.frames_seen,
                "palmStatus": getattr(last_palm, "status", None),
            }
            if stream_events and last_payload:
                result.update(last_payload)
            return result

        roi_len = ctypes.c_int(160 * 160)
        roi_buf = (ctypes.c_uint8 * roi_len.value)()
        feat_len = ctypes.c_int(XR_VEIN_FEATURE_INFO_SIZE)
        feat_buf = (ctypes.c_uint8 * XR_VEIN_FEATURE_INFO_SIZE)()
        ret = self.vein.XR_Vein_FinishEnroll(
            self.alg_handle,
            ctypes.cast(roi_buf, ctypes.c_void_p),
            ctypes.byref(roi_len),
            ctypes.cast(feat_buf, ctypes.c_void_p),
            ctypes.byref(feat_len),
        )
        if ret != PV_OK:
            raise RuntimeError(f"XR_Vein_FinishEnroll failed: {ret}")

        Path(templates_dir).mkdir(parents=True, exist_ok=True)
        out_path = template_path(templates_dir, template_ref)
        out_path.write_bytes(bytes(feat_buf[: feat_len.value]))

        result = {
            "ok": True,
            "action": "enroll",
            "event": "enrolled",
            "templateRef": template_ref,
            "featureBytes": feat_len.value,
            "sampleCount": enroll_step.value,
            "attempts": attempts,
            "framesSeen": self.frames_seen,
            "sdkVersion": self.sdk_version,
            "deviceName": self.dev.devName if self.dev else "",
        }
        if stream_events and last_payload:
            result.update(last_payload)
            result["ok"] = True
            result["event"] = "enrolled"
            result["featureBytes"] = feat_len.value
        return result

    def verify(self, template_ref, templates_dir, timeout_sec, stream_events=False):
        path = template_path(templates_dir, template_ref)
        if not path.exists():
            return {
                "ok": False,
                "action": "verify",
                "error": "template_not_found",
                "templateRef": template_ref,
            }
        enrolled = path.read_bytes()
        if len(enrolled) != XR_VEIN_FEATURE_INFO_SIZE:
            return {
                "ok": False,
                "action": "verify",
                "error": "template_invalid",
                "templateRef": template_ref,
                "featureBytes": len(enrolled),
            }
        enrolled_buf = (ctypes.c_uint8 * len(enrolled)).from_buffer_copy(enrolled)

        deadline = time.time() + timeout_sec
        attempts = 0
        best_distance = None
        last_ret = None
        last_tip = None
        last_payload = None

        while time.time() < deadline:
            gray, width, height = self.next_gray_frame(deadline)
            attempts += 1
            img = (ctypes.c_uint8 * len(gray)).from_buffer_copy(gray)
            feat_buf = (ctypes.c_uint8 * XR_VEIN_FEATURE_INFO_SIZE)()
            feat_len = ctypes.c_int(XR_VEIN_FEATURE_INFO_SIZE)
            cap_tip = ctypes.c_int(0)
            palm_info = SPalmInfo()
            high_bright = ctypes.c_uint8(0)
            ret = self.vein.XR_Vein_GrabFeatureFromFullImg(
                self.alg_handle,
                ctypes.cast(img, ctypes.c_void_p),
                height,
                width,
                1,
                ctypes.cast(feat_buf, ctypes.c_void_p),
                ctypes.byref(feat_len),
                ctypes.byref(cap_tip),
                ctypes.byref(palm_info),
                ctypes.byref(high_bright),
            )
            last_ret = ret
            last_tip = cap_tip.value
            last_payload = self._scan_payload(
                "verify",
                gray,
                width,
                height,
                ret,
                cap_tip.value,
                palm_info,
                high_bright.value,
                attempts=attempts,
            )
            self._maybe_emit_scan(
                stream_events,
                last_payload,
                force=ret == PV_OK or attempts <= 3,
            )
            if ret != PV_OK:
                log("verify feature failed", attempt=attempts, ret=ret, capTip=cap_tip.value)
                continue

            distance = ctypes.c_float(3.0)
            calc_ret = self.vein.XR_Vein_CalcFeatureDist(
                ctypes.cast(enrolled_buf, ctypes.c_void_p),
                XR_VEIN_FEATURE_INFO_SIZE,
                ctypes.cast(feat_buf, ctypes.c_void_p),
                XR_VEIN_FEATURE_INFO_SIZE,
                ctypes.byref(distance),
            )
            if calc_ret != PV_OK:
                log("verify distance failed", attempt=attempts, ret=calc_ret)
                continue
            value = float(distance.value)
            best_distance = value if best_distance is None else min(best_distance, value)
            log("verify attempt", attempt=attempts, distance=value, threshold=XR_VEIN_THRESH)
            if value < XR_VEIN_THRESH:
                result = {
                    "ok": True,
                    "action": "verify",
                    "event": "matched",
                    "templateRef": template_ref,
                    "distance": value,
                    "threshold": XR_VEIN_THRESH,
                    "attempts": attempts,
                    "framesSeen": self.frames_seen,
                    "sdkVersion": self.sdk_version,
                    "deviceName": self.dev.devName if self.dev else "",
                }
                if stream_events and last_payload:
                    result.update(last_payload)
                    result["ok"] = True
                    result["event"] = "matched"
                    result["distance"] = value
                    result["threshold"] = XR_VEIN_THRESH
                return result

        result = {
            "ok": False,
            "action": "verify",
            "error": "no_match",
            "templateRef": template_ref,
            "distance": best_distance,
            "threshold": XR_VEIN_THRESH,
            "attempts": attempts,
            "framesSeen": self.frames_seen,
            "sdkReturn": last_ret,
            "capTip": last_tip,
        }
        if stream_events and last_payload:
            result.update(last_payload)
            result["ok"] = False
            result["error"] = "no_match"
            result["distance"] = best_distance
            result["threshold"] = XR_VEIN_THRESH
        return result

    def close(self):
        try:
            if self.dev_ptr:
                try:
                    self.sonix.SonixCam_StopPreview(self.dev_ptr)
                except Exception:
                    pass
                try:
                    if self.sonix.SonixCam_IsOpened(self.dev_ptr):
                        self.sonix.SonixCam_CloseCamera(self.dev_ptr)
                except Exception:
                    pass
        finally:
            try:
                if self.alg_handle:
                    self.vein.XR_Vein_DeInit(self.alg_handle)
            except Exception:
                pass
            try:
                self.sonix.SonixCam_UnInit()
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", choices=["enroll", "verify"], required=True)
    parser.add_argument("--sdk-dir", required=True)
    parser.add_argument("--templates-dir", required=True)
    parser.add_argument("--template-ref", required=True)
    parser.add_argument("--participant-id", default="")
    parser.add_argument("--transaction-id", default="")
    parser.add_argument("--timeout-sec", type=float, default=35)
    parser.add_argument("--device-index", type=int, default=0)
    parser.add_argument("--stream-events", action="store_true")
    args = parser.parse_args()

    sdk = None
    try:
        sdk = PalmSdk(args.sdk_dir)
        sdk.initialize(args.device_index)
        if args.stream_events:
            emit_stream(
                "ready",
                {
                    "action": args.action,
                    "deviceName": sdk.dev.devName if sdk.dev else "",
                    "sdkVersion": sdk.sdk_version,
                },
            )
        if args.action == "enroll":
            result = sdk.enroll(
                args.template_ref,
                args.templates_dir,
                args.timeout_sec,
                stream_events=args.stream_events,
            )
        else:
            result = sdk.verify(
                args.template_ref,
                args.templates_dir,
                args.timeout_sec,
                stream_events=args.stream_events,
            )
        result.update(
            {
                "participantId": args.participant_id,
                "transactionId": args.transaction_id,
            }
        )
        if args.stream_events:
            emit_stream("done", result)
        else:
            emit(result)
        return 0 if result.get("ok") else 2
    except Exception as exc:
        log("fatal", error=str(exc))
        result = {
            "ok": False,
            "action": args.action,
            "error": "sdk_worker_error",
            "message": str(exc),
            "templateRef": args.template_ref,
            "participantId": args.participant_id,
            "transactionId": args.transaction_id,
        }
        if args.stream_events:
            emit_stream("done", result)
        else:
            emit(result)
        return 1
    finally:
        if sdk is not None:
            sdk.close()


if __name__ == "__main__":
    raise SystemExit(main())
