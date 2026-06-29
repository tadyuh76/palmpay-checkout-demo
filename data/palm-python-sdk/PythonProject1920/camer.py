import os
import time
import tkinter as tk
from tkinter import simpledialog
from _ctypes import POINTER, byref, addressof
from tkinter import messagebox
import ctypes
import numpy as np
import cv2
from PIL import Image, ImageTk
import threading
import datetime
import json


# 设置 Tcl/Tk 路径（根据你的实际安装路径修改）
os.environ['TCL_LIBRARY'] = r'C:\Users\liudu\AppData\Local\Programs\Python\Python313\tcl\tcl8.6'
os.environ['TK_LIBRARY'] = r'C:\Users\liudu\AppData\Local\Programs\Python\Python313\tcl\tk8.6'

# 获取当前脚本所在目录
script_dir = os.path.dirname(os.path.realpath(__file__))
sonix_dll_path = os.path.join(script_dir, "SonixCamera.dll")
xr_dll_path = os.path.join(script_dir, "XRCommonVeinAlgAPI.dll")

# 创建Imgs目录用于保存图像
if not os.path.exists("Imgs"):
    os.makedirs("Imgs")

# 加载 C++ DLL
try:
    sonix_camera_api = ctypes.CDLL(sonix_dll_path)
    xr_vein_api = ctypes.CDLL(xr_dll_path)
except Exception as e:
    print(f"加载 DLL 失败：{e}")
    messagebox.showerror("错误", f"加载 DLL 失败：{e}")

# 定义一些常量
CA_PV_OK = 0
XR_VEIN_FEATURE_INFO_SIZE = 1036  # 假设特征信息大小为 256
XR_VEIN_THRESH = 0.5  # 假设阈值为 0.5
MAX_CAMERAS = 10  # 最大摄像头数量



# 定义结构体
class scDevice(ctypes.Structure):
    _fields_ = [
        ('devName', ctypes.c_char * 256)
    ]


class sPalmInfo(ctypes.Structure):
    _fields_ = [
        ('x', ctypes.c_int),
        ('y', ctypes.c_int),
        ('width', ctypes.c_int),
        ('height', ctypes.c_int),
        ('palm_bright', ctypes.c_int),
        ('status', ctypes.c_int)
    ]


# 初始化 DLL 函数参数和返回类型
sonix_camera_api.SonixCam_Init.restype = ctypes.c_bool
sonix_camera_api.SonixCam_EnumCameras.argtypes = [
    ctypes.POINTER(ctypes.c_uint),  # 设备数量（输出参数）
    ctypes.POINTER(scDevice),  # 设备数组（输入/输出参数）
    ctypes.c_uint  # 数组大小
]
sonix_camera_api.SonixCam_EnumCameras.restype = ctypes.c_bool

# 定义回调函数类型
SampleGrabberCB = ctypes.CFUNCTYPE(
    ctypes.c_int,  # 返回值类型
    ctypes.c_double,  # sampleTime
    ctypes.POINTER(ctypes.c_ubyte),  # buffer
    ctypes.c_int  # bufferSize
)

# 设置函数参数类型
sonix_camera_api.SonixCam_OpenCamera.argtypes = [
    ctypes.c_void_p,  # 设备指针
    ctypes.c_void_p,  # 窗口句柄
    SampleGrabberCB,  # 回调函数
    ctypes.c_void_p  # 类指针
]
sonix_camera_api.SonixCam_OpenCamera.restype = ctypes.c_bool
sonix_camera_api.SonixCam_IsOpened.argtypes = [ctypes.c_void_p]
sonix_camera_api.SonixCam_IsOpened.restype = ctypes.c_bool
sonix_camera_api.SonixCam_CloseCamera.argtypes = [ctypes.c_void_p]
sonix_camera_api.SonixCam_CloseCamera.restype = ctypes.c_bool
sonix_camera_api.SonixCam_StartPreview.argtypes = [ctypes.c_void_p]
sonix_camera_api.SonixCam_StartPreview.restype = ctypes.c_bool
sonix_camera_api.SonixCam_StopPreview.argtypes = [ctypes.c_void_p]
sonix_camera_api.SonixCam_StopPreview.restype = ctypes.c_bool
sonix_camera_api.SonixCam_SetFrameRate.argtypes = [ctypes.c_void_p, ctypes.c_int]
sonix_camera_api.SonixCam_SetFrameRate.restype = ctypes.c_bool
sonix_camera_api.SonixCam_GetFormatCount.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint)]
sonix_camera_api.SonixCam_GetFormatCount.restype = ctypes.c_bool
sonix_camera_api.SonixCam_GetFormat.argtypes = [ctypes.c_void_p, ctypes.c_byte, ctypes.POINTER(ctypes.c_void_p)]
sonix_camera_api.SonixCam_GetFormat.restype = ctypes.c_bool
sonix_camera_api.SonixCam_SetPreviewFormat.argtypes = [ctypes.c_void_p, ctypes.c_byte]
sonix_camera_api.SonixCam_SetPreviewFormat.restype = ctypes.c_bool
sonix_camera_api.SonixCam_AdjustPreviewWindow.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_int, ctypes.c_int,
                                                          ctypes.c_int, ctypes.c_int]
sonix_camera_api.SonixCam_AdjustPreviewWindow.restype = ctypes.c_bool
sonix_camera_api.SonixCam_AsicRegisterRead.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_int]
sonix_camera_api.SonixCam_AsicRegisterRead.restype = ctypes.c_bool
sonix_camera_api.SonixCam_AsicRegisterWrite.argtypes = [
    ctypes.c_void_p,           # pDevice: 设备句柄指针
    ctypes.c_int,              # addr: 寄存器地址
    POINTER(ctypes.c_byte),    # data: 数据缓冲区
    ctypes.c_int  # dataLen: 数据长度
]
sonix_camera_api.SonixCam_AsicRegisterWrite.restype = ctypes.c_bool

xr_vein_api.XR_Vein_Init.argtypes = [ctypes.POINTER(ctypes.c_void_p)]
xr_vein_api.XR_Vein_Init.restype = ctypes.c_int
xr_vein_api.XR_Vein_GetVersion.argtypes = [ctypes.c_char_p, ctypes.POINTER(ctypes.c_int)]
xr_vein_api.XR_Vein_GetVersion.restype = ctypes.c_int
xr_vein_api.XR_Vein_GetLicCode.argtypes = [ctypes.c_void_p, POINTER(ctypes.c_uint8),  POINTER(ctypes.c_int)]
xr_vein_api.XR_Vein_GetLicCode.restype = ctypes.c_int
xr_vein_api.XR_Vein_ActivateVeinSDK.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int]
xr_vein_api.XR_Vein_ActivateVeinSDK.restype = ctypes.c_int
xr_vein_api.XR_Vein_InitEnrollEnv.argtypes = [ctypes.c_void_p]
xr_vein_api.XR_Vein_InitEnrollEnv.restype = ctypes.c_int
xr_vein_api.XR_Vein_TryEnroll.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                          ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int),
                                          ctypes.POINTER(sPalmInfo), ctypes.POINTER(ctypes.c_byte)]
xr_vein_api.XR_Vein_TryEnroll.restype = ctypes.c_int
xr_vein_api.XR_Vein_FinishEnroll.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(ctypes.c_int),
                                             ctypes.c_void_p, ctypes.POINTER(ctypes.c_int)]
xr_vein_api.XR_Vein_FinishEnroll.restype = ctypes.c_int
xr_vein_api.XR_Vein_GrabFeatureFromFullImg.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.c_int,
                                                       ctypes.c_int, ctypes.c_void_p, ctypes.POINTER(ctypes.c_int),
                                                       ctypes.POINTER(ctypes.c_int), ctypes.POINTER(sPalmInfo),
                                                       ctypes.POINTER(ctypes.c_byte)]
xr_vein_api.XR_Vein_GrabFeatureFromFullImg.restype = ctypes.c_int
xr_vein_api.XR_Vein_CalcFeatureDist.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_int,
                                                ctypes.POINTER(ctypes.c_float)]
xr_vein_api.XR_Vein_CalcFeatureDist.restype = ctypes.c_int


class PalmVeinInfo:
    def __init__(self, reg_img_paths, roi_img_path, feat_buf):
        self.userId = str(id(self))
        self.regImgPaths = reg_img_paths
        self.roiImgPath = roi_img_path
        self.feat_buf = feat_buf







class App:
    def __init__(self, root):
        self.root = root
        self.root.title("掌静脉识别系统")
        self.root.geometry("800x600")
        self.root.resizable(True, True)

        # 设置中文字体
        self.root.option_add("*Font", "SimHei 10")

        # 初始化变量
        self.devList = []
        self.pDevHandle = ctypes.c_void_p()
        self.devIndex = -1
        self.isRegisterPalmVein = False
        self.isRegisterPalmVeinInit = False
        self.isComparePalmVein = False
        self.IsPalmVeinProcessing = False
        self.checkCount = 0
        self.enroll_step = 0
        self.isXRSDKActivated = False
        self.dicPalmVeins = {}
        self.palmVeinInfo = None

        # 创建UI组件
        self.create_ui()

        # 定义回调函数
        @SampleGrabberCB
        def sample_grabber_callback(sampleTime, buffer, bufferSize):
            try:
                self.root.after(0, lambda: self.process_frame(buffer, bufferSize, sampleTime))
                return 0
            except Exception as e:
                self.add_log(f"回调异常: {e}")
                return 1

        self.sample_grabber_callback = sample_grabber_callback

        # 初始化SDK
        self.init_sdk()

        # 加载已保存的掌静脉数据
        self.loadPalmVeins()

        # 设置窗口关闭时的清理操作
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

    def create_ui(self):
        """创建UI组件"""
        # 创建主框架
        main_frame = tk.Frame(self.root)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        # 左侧控制面板
        control_frame = tk.Frame(main_frame, width=200)
        control_frame.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 10))

        # 摄像头选择
        tk.Label(control_frame, text="选择摄像头:").pack(anchor=tk.W)
        self.cmbCameras = tk.Listbox(control_frame, height=5)
        self.cmbCameras.pack(fill=tk.X, pady=(0, 10))

        # 控制按钮
        btn_frame = tk.Frame(control_frame)
        btn_frame.pack(fill=tk.X, pady=(0, 10))

        self.btnOpen = tk.Button(btn_frame, text="打开摄像头", command=self.btnOpen_Click)
        self.btnOpen.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5))

        self.btnClose = tk.Button(btn_frame, text="关闭摄像头", command=self.btnClose_Click)
        self.btnClose.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(5, 0))
        self.btnClose.config(state=tk.DISABLED)

        # 功能按钮
        func_frame = tk.Frame(control_frame)
        func_frame.pack(fill=tk.X, pady=(0, 10))

        self.btnRegister = tk.Button(func_frame, text="注册掌静脉", command=self.btnRegister_Click)
        self.btnRegister.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5))
        self.btnRegister.config(state=tk.DISABLED)

        self.btnCompare = tk.Button(func_frame, text="比对掌静脉", command=self.btnCompare_Click)
        self.btnCompare.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(5, 0))
        self.btnCompare.config(state=tk.DISABLED)

        # 已注册用户列表
        tk.Label(control_frame, text="已注册用户:").pack(anchor=tk.W)
        self.userList = tk.Listbox(control_frame, height=10)
        self.userList.pack(fill=tk.BOTH, expand=True)
        self.userList.bind('<<ListboxSelect>>', self.on_user_selected)

        # 右侧显示区域
        display_frame = tk.Frame(main_frame)
        display_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)

        # 图像显示区域
        self.pictureBox = tk.Label(display_frame, bg="black")
        self.pictureBox.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        # 日志显示区域
        tk.Label(display_frame, text="系统日志:").pack(anchor=tk.W)
        self.lbLog = tk.Listbox(display_frame, height=10)
        self.lbLog.pack(fill=tk.BOTH, expand=True)
        scrollbar = tk.Scrollbar(self.lbLog, orient=tk.VERTICAL)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.lbLog.config(yscrollcommand=scrollbar.set)
        scrollbar.config(command=self.lbLog.yview)

    def process_frame(self, buffer, bufferSize, sampleTime):
        """处理视频帧"""
        try:
            if bufferSize <= 0:
                return

            imgBuf = np.frombuffer(ctypes.string_at(buffer, bufferSize), dtype=np.uint8)
            img = cv2.imdecode(imgBuf, cv2.IMREAD_COLOR)

            if img is None:
                self.add_log("图像解码失败")
                return

            # 调整图像大小以适应显示窗口
            window_width = self.pictureBox.winfo_width()
            window_height = self.pictureBox.winfo_height()

            if window_width > 1 and window_height > 1:
                img_height, img_width = img.shape[:2]
                ratio = min(window_width / img_width, window_height / img_height)
                img = cv2.resize(img, (int(img_width * ratio), int(img_height * ratio)))

            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img = Image.fromarray(img)
            img = ImageTk.PhotoImage(image=img)

            self.pictureBox.config(image=img)
            self.pictureBox.image = img

            # 处理掌静脉逻辑
            if (self.isRegisterPalmVein or self.isComparePalmVein) and not self.IsPalmVeinProcessing:
                if self.isRegisterPalmVein:
                    threading.Thread(target=self.EnrollProcess, args=(imgBuf,)).start()
                elif self.isComparePalmVein:
                    threading.Thread(target=self.RecgProcess, args=(imgBuf,)).start()
        except Exception as e:
            self.add_log(f"处理帧异常: {e}")

    def init_sdk(self):
        """初始化SDK"""
        self.add_log("正在初始化SDK...")
        if sonix_camera_api.SonixCam_Init():
            self.add_log("摄像头SDK初始化成功")

            # 枚举摄像头
            devCount = ctypes.c_uint(0)
            devs_array = (scDevice * MAX_CAMERAS)()

            if sonix_camera_api.SonixCam_EnumCameras(ctypes.byref(devCount), devs_array, MAX_CAMERAS):
                if devCount.value == 0:
                    self.add_log("未找到摄像头设备")
                    return

                for i in range(devCount.value):
                    dev = devs_array[i]
                    # 存储设备对象和设备指针（通过引用获取）
                    dev_ptr = ctypes.pointer(dev)
                    self.devList.append((dev, dev_ptr))
                    dev_name = dev.devName.decode('utf-8', errors='replace')
                    self.add_log(f"找到摄像头 {i + 1}: {dev_name}")
                    self.cmbCameras.insert(tk.END, dev_name)

                if self.cmbCameras.size() > 0:
                    self.cmbCameras.select_set(0)
                    self.devIndex = 0
                    self.btnOpen.config(state=tk.NORMAL)
            else:
                self.add_log("获取摄像头列表失败")
        else:
            self.add_log("摄像头SDK初始化失败")
            messagebox.showerror("错误", "摄像头SDK初始化失败")

        # 初始化掌静脉识别SDK
        version = ctypes.create_string_buffer(64)
        len_ = ctypes.c_int(64)
        ret = xr_vein_api.XR_Vein_GetVersion(version, ctypes.byref(len_))
        if ret == CA_PV_OK:
            self.add_log(f"掌静脉SDK版本: {version.value.decode('utf-8')}")
        else:
            self.add_log(f"获取掌静脉SDK版本失败，错误码: {ret}")

        ret = xr_vein_api.XR_Vein_Init(ctypes.byref(self.pDevHandle))
        if ret == CA_PV_OK:
            self.add_log("掌静脉SDK初始化成功")
            # 创建缓冲区
            buf_len = 256
            code_buf = (ctypes.c_uint8 * buf_len)()
            code_len = ctypes.c_int(buf_len)

            result = xr_vein_api.XR_Vein_GetLicCode(self.pDevHandle, code_buf, byref(code_len))

            if result == CA_PV_OK:
                lic_code = bytes(code_buf[:code_len.value])
                print(f"LicCode: {lic_code.hex()}")
                self.add_log(f"LicCode: {lic_code.hex()}")

                # 通过授权码获取激活码
                dst_data1 = (ctypes.c_byte * 17)()  # 16 + 1
                out_len = ctypes.c_int(16)

                # 修复参数传递问题：直接传递out_len而不是byref(out_len)
                decrypt_ret = self.xr_bsp_chip_sm2_decrypt(bytes(lic_code), code_len, dst_data1, out_len)
                self.add_log(f"out_len: {out_len.value}")
                # 修复字节值转换问题，正确处理ctypes数组
                dst_data1_bytes = bytes([dst_data1[i] & 0xFF for i in range(16)])
                self.add_log(f"dst_data1: {dst_data1_bytes.hex()}")
                
                # 激活SDK
                if decrypt_ret == CA_PV_OK:
                    # 使用修复后的字节数据
                    act_code_bytes = dst_data1_bytes
                    pActCode = ctypes.create_string_buffer(act_code_bytes)
                    
                    ret = xr_vein_api.XR_Vein_ActivateVeinSDK(
                        self.pDevHandle, 
                        ctypes.cast(pActCode, ctypes.c_void_p), 
                        16
                    )
                    
                    if ret == CA_PV_OK:
                        self.isXRSDKActivated = True
                        self.add_log("激活掌静脉SDK成功")
                        messagebox.showinfo("成功", "掌静脉SDK初始化完成")
                    else:
                        self.add_log(f"激活许可证失败，错误码: {ret}")
                        messagebox.showerror("错误", f"激活许可证失败，错误码: {ret}")
                else:
                    self.add_log(f"解密许可证失败，错误码: {decrypt_ret}")
                    messagebox.showerror("错误", f"解密许可证失败，错误码: {decrypt_ret}")

            else:
                self.add_log(f"获取许可证代码失败，错误码: {result}")
                messagebox.showerror("错误", f"获取许可证代码失败，错误码: {result}")
        else:
            self.add_log(f"掌静脉SDK初始化失败，错误码: {ret}")
            messagebox.showerror("错误", f"掌静脉SDK初始化失败，错误码: {ret}")

    def add_log(self, log):
        """添加日志到日志列表"""
        current_time = datetime.datetime.now().strftime("%H:%M:%S")
        self.lbLog.insert(tk.END, f"{current_time} - {log}")
        self.lbLog.see(tk.END)

    def btnOpen_Click(self):
        """打开摄像头按钮事件处理"""
        if self.devIndex < 0 or self.devIndex >= len(self.devList):
            self.add_log("请选择摄像头")
            return

        # 获取设备指针
        dev_ptr = self.devList[self.devIndex][1]
        if sonix_camera_api.SonixCam_IsOpened(dev_ptr):
            self.add_log("摄像头已打开")
            return

        # 获取Tkinter窗口句柄
        self.root.update()
        hWnd = ctypes.windll.user32.GetActiveWindow()

        # 打开摄像头，传递回调函数
        if sonix_camera_api.SonixCam_OpenCamera(dev_ptr, hWnd, self.sample_grabber_callback, None):
            self.add_log("打开摄像头成功")
            self.btnOpen.config(state=tk.DISABLED)
            self.btnClose.config(state=tk.NORMAL)

            # 设置预览格式并开始预览
            if self.set_preview_format(dev_ptr):
                if sonix_camera_api.SonixCam_StartPreview(dev_ptr):
                    self.add_log("开始预览成功")
                    # 如果SDK已激活，启用注册和比对按钮
                    if self.isXRSDKActivated:
                        self.btnRegister.config(state=tk.NORMAL)
                        self.btnCompare.config(state=tk.NORMAL)
                    else:
                        self.add_log("掌静脉SDK未激活，无法启用注册和比对功能")
                else:
                    self.add_log("开始预览失败")
            else:
                self.add_log("设置预览格式失败")
        else:
            self.add_log("打开摄像头失败")

    def set_preview_format(self, dev_ptr):
        """设置摄像头预览格式"""
        try:
            # 获取支持的格式数量
            formatCount = ctypes.c_uint(0)
            if not sonix_camera_api.SonixCam_GetFormatCount(dev_ptr, ctypes.byref(formatCount)):
                self.add_log("获取格式数量失败")
                return False

            # 尝试设置第一种格式
            for i in range(formatCount.value):
                i = 1; # 1对应的格式是1920 * 1080
                if sonix_camera_api.SonixCam_SetPreviewFormat(dev_ptr, i):
                    self.add_log(f"设置预览格式 {i} 成功")
                    # 调整预览窗口
                    if sonix_camera_api.SonixCam_AdjustPreviewWindow(dev_ptr, False, 0, 0, 0, 0):
                        self.add_log("调整预览窗口成功")
                        return True
                    else:
                        self.add_log("调整预览窗口失败")
                else:
                    self.add_log(f"设置预览格式 {i} 失败")

            self.add_log("找不到合适的预览格式")
            return False
        except Exception as e:
            self.add_log(f"设置预览格式异常: {e}")
            return False

    def btnClose_Click(self):
        """关闭摄像头按钮事件处理"""
        if self.devIndex < 0 or self.devIndex >= len(self.devList):
            self.add_log("请选择摄像头")
            return

        # 获取设备指针
        dev_ptr = self.devList[self.devIndex][1]
        if not sonix_camera_api.SonixCam_IsOpened(dev_ptr):
            self.add_log("摄像头已关闭")
            return

        # 停止预览并关闭摄像头
        if sonix_camera_api.SonixCam_IsPreviewing(dev_ptr):
            if sonix_camera_api.SonixCam_StopPreview(dev_ptr):
                self.add_log("停止预览成功")
            else:
                self.add_log("停止预览失败")

        if sonix_camera_api.SonixCam_CloseCamera(dev_ptr):
            self.add_log("关闭摄像头成功")
            self.btnOpen.config(state=tk.NORMAL)
            self.btnClose.config(state=tk.DISABLED)
            self.btnRegister.config(state=tk.DISABLED)
            self.btnCompare.config(state=tk.DISABLED)
        else:
            self.add_log("关闭摄像头失败")

    def btnRegister_Click(self):
        """注册掌静脉按钮事件处理"""
        if not self.isXRSDKActivated:
            messagebox.showinfo("错误", "掌静脉SDK未激活")
            return

        if self.devIndex < 0 or self.devIndex >= len(self.devList):
            messagebox.showinfo("错误", "请选择摄像头")
            return
            
        # 获取设备指针
        dev_ptr = self.devList[self.devIndex][1]
        if not sonix_camera_api.SonixCam_IsOpened(dev_ptr):
            messagebox.showinfo("错误", "请先打开摄像头")
            return

        # 提示用户输入姓名
        name = simpledialog.askstring("注册", "请输入用户姓名:", parent=self.root)
        if not name:
            return

        self.palmVeinInfo = PalmVeinInfo(["", "", ""], "", None)
        self.palmVeinInfo.name = name  # 保存用户姓名
        self.isRegisterPalmVein = True
        self.isComparePalmVein = self.isRegisterPalmVeinInit = False
        self.checkCount = 0
        self.enroll_step = 0
        self.btnRegister.config(state=tk.DISABLED)
        self.btnCompare.config(state=tk.DISABLED)
        self.add_log(f"开始注册掌静脉: {name}")
        self.add_log(f"请将手掌放在摄像头前，系统将采集3次图像")
        # messagebox.showinfo("提示", "请将手掌放在摄像头前，系统将采集3次图像")

    def btnCompare_Click(self):
        """比对掌静脉按钮事件处理"""
        if not self.isXRSDKActivated:
            messagebox.showinfo("错误", "掌静脉SDK未激活")
            return
            
        if self.devIndex < 0 or self.devIndex >= len(self.devList):
            messagebox.showinfo("错误", "请选择摄像头")
            return

        # 获取设备指针
        dev_ptr = self.devList[self.devIndex][1]
        if not sonix_camera_api.SonixCam_IsOpened(dev_ptr):
            messagebox.showinfo("错误", "请先打开摄像头")
            return

        if len(self.dicPalmVeins) == 0:
            messagebox.showinfo("错误", "没有注册的掌静脉数据，请先注册")
            return

        self.isRegisterPalmVein = self.isRegisterPalmVeinInit = self.IsPalmVeinProcessing = False
        self.isComparePalmVein = True
        self.checkCount = 0
        self.btnRegister.config(state=tk.DISABLED)
        self.btnCompare.config(state=tk.DISABLED)
        self.add_log("开始比对掌静脉")
        self.add_log("请将手掌放在摄像头前进行比对")
        # messagebox.showinfo("提示", "请将手掌放在摄像头前进行比对")
        # messagebox.showinfo("提示", "请将手掌放在摄像头前进行比对")

    def EnrollProcess(self, imgBuf):
        """掌静脉注册处理"""
        self.IsPalmVeinProcessing = True
        try:
            self.checkCount += 1
            ret = 0

            if not self.isRegisterPalmVeinInit:
                ret = xr_vein_api.XR_Vein_InitEnrollEnv(self.pDevHandle)
                if ret == CA_PV_OK:
                    self.isRegisterPalmVeinInit = True
                    self.add_log("初始化注册环境成功")
                else:
                    self.add_log(f"初始化注册环境失败，错误码: {ret}")
                    self.isRegisterPalmVein = False
                    return

            high_bright = ctypes.c_byte(0)
            liveness_flag = 1  # 活体检测标志
            cap_tip = ctypes.c_int(0)
            palm_info = sPalmInfo()

            img = cv2.imdecode(imgBuf, cv2.IMREAD_COLOR)
            gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            gray_img_buf = gray_img.flatten()
            pGrayImgBuf = ctypes.c_void_p(gray_img_buf.ctypes.data)

            ret = xr_vein_api.XR_Vein_TryEnroll(
                self.pDevHandle,
                pGrayImgBuf,
                img.shape[0],
                img.shape[1],
                liveness_flag,
                ctypes.byref(ctypes.c_int(self.enroll_step)),
                ctypes.byref(cap_tip),
                ctypes.byref(palm_info),
                ctypes.byref(high_bright)
            )
            self.add_log(f"enroll_step: {self.enroll_step}")
            if ret == CA_PV_OK:
                # 保存注册图像
                self.palmVeinInfo.regImgPaths[
                    self.enroll_step] = f"Imgs/{self.palmVeinInfo.userId}_cap{self.enroll_step + 1}.jpg"
                cv2.imwrite(self.palmVeinInfo.regImgPaths[self.enroll_step], img)
                self.enroll_step += 1
                self.add_log(f"成功采集第 {self.enroll_step} 轮图像")

                if palm_info.status == 1:
                    self.add_log(
                        f"手掌位置: x={palm_info.x}, y={palm_info.y}, w={palm_info.width}, h={palm_info.height}, 亮度={palm_info.palm_bright}")
            elif ret == -1:  # 假设低质量错误码为 -1
                self.showTip(cap_tip.value)
            else:
                if ret == -2:  # 假设无手错误码为 -2
                    self.add_log("未找到手掌，请调整位置")
                else:
                    self.add_log(f"注册失败，错误码: {ret}")

            # 当采集完3次图像后，完成注册
            if self.enroll_step == 3:
                # 替换 #selectedCode 中的代码为以下内容：
                # 创建固定大小的缓冲区
                # roi_len = 160 * 160
                # roi_img_buf = (ctypes.c_uint8 * roi_len)()  # ROI图像缓冲区
                # roi_len_ref = ctypes.c_int(roi_len)  # ROI长度引用
                #
                # feat_len = XR_VEIN_FEATURE_INFO_SIZE
                # feat_buf = (ctypes.c_uint8 * feat_len)()  # 特征缓冲区
                # feat_len_ref = ctypes.c_int(feat_len)  # 特征长度引用
                #
                # # 调用FinishEnroll函数
                # ret = xr_vein_api.XR_Vein_FinishEnroll(
                #     self.pDevHandle,  # alg_handle
                #     roi_img_buf,  # roi_img_buf - 直接传递数组
                #     ctypes.byref(roi_len_ref),  # &roi_len - 传递引用
                #     feat_buf,  # reg_feat_buf - 直接传递数组
                #     ctypes.byref(feat_len_ref)  # &feat_len - 传递引用
                # )

                roi_len = 160 * 160
                # roi_len = 320 * 320
                roi_img_buf = np.zeros(roi_len, dtype=np.uint8)
                pRoiImgBuf = ctypes.c_void_p(roi_img_buf.ctypes.data)

                feat_len = XR_VEIN_FEATURE_INFO_SIZE
                feat_buf = np.zeros(feat_len, dtype=np.uint8)
                pFeatBuf = ctypes.c_void_p(feat_buf.ctypes.data)

                # 在调用 xr_vein_api.XR_Vein_FinishEnroll 之前添加以下调试代码
                self.add_log(f"调试信息 - pDevHandle: {self.pDevHandle}")
                self.add_log(f"调试信息 - pRoiImgBuf: {pRoiImgBuf}")
                self.add_log(f"调试信息 - roi_len: {roi_len}")
                self.add_log(f"调试信息 - pFeatBuf: {pFeatBuf}")
                self.add_log(f"调试信息 - feat_len: {feat_len}")

                ret = xr_vein_api.XR_Vein_FinishEnroll(
                    self.pDevHandle,
                    pRoiImgBuf,
                    ctypes.byref(ctypes.c_int(roi_len)),
                    pFeatBuf,
                    ctypes.byref(ctypes.c_int(feat_len))
                )

                if ret == CA_PV_OK:
                    self.add_log("掌静脉特征提取成功")
                    self.palmVeinInfo.roiImgPath = f"Imgs/{self.palmVeinInfo.userId}_roi.jpg"
                    # 将 ctypes 数组转换为 numpy 数组用于图像处理
                    roi_img_array = np.ctypeslib.as_array(roi_img_buf, shape=(roi_len,))
                    roi_img = roi_img_array.reshape((160, 160))
                    cv2.imwrite(self.palmVeinInfo.roiImgPath, roi_img)
                    # 将 ctypes 数组转换为 numpy 数组保存
                    self.palmVeinInfo.feat_buf = np.ctypeslib.as_array(feat_buf, shape=(feat_len,))

                    # 保存注册信息
                    self.dicPalmVeins[self.palmVeinInfo.userId] = self.palmVeinInfo
                    self.savePalmVeins()

                    # 更新用户列表
                    self.update_user_list()

                    messagebox.showinfo("成功",
                                        f"掌静脉注册成功\n用户ID: {self.palmVeinInfo.userId}\n姓名: {self.palmVeinInfo.name}")
                else:
                    messagebox.showerror("错误", f"掌静脉特征提取失败，错误码: {ret}")
                    self.add_log(f"掌静脉特征提取失败，错误码: {ret}")
        except Exception as e:
            self.add_log(f"注册过程异常: {e}")
        finally:
            if self.checkCount > 80 or self.enroll_step == 3:  # 最多尝试30次
                self.add_log("注册过程结束")
                if self.enroll_step != 3:
                    messagebox.showinfo("提示", "掌静脉注册失败，请重试")
                    self.DelegatePalmVeinInfo(self.palmVeinInfo)
                self.isRegisterPalmVein = False
                self.btnRegister.config(state=tk.NORMAL)
                self.btnCompare.config(state=tk.NORMAL)
            self.IsPalmVeinProcessing = False

    def RecgProcess(self, imgBuf):
        """掌静脉比对处理"""
        self.IsPalmVeinProcessing = True
        recg_feat_len = XR_VEIN_FEATURE_INFO_SIZE
        recg_feat_buf = np.zeros(recg_feat_len, dtype=np.uint8)
        pRecgFeatBuf = ctypes.c_void_p(recg_feat_buf.ctypes.data)

        try:
            self.checkCount += 1
            ret = 0
            high_bright = ctypes.c_byte(0)
            liveness_flag = 1  # 活体检测标志
            cap_tip = ctypes.c_int(0)
            palm_info = sPalmInfo()

            img = cv2.imdecode(imgBuf, cv2.IMREAD_COLOR)
            gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            gray_img_buf = gray_img.flatten()
            pGrayImgBuf = ctypes.c_void_p(gray_img_buf.ctypes.data)

            ret = xr_vein_api.XR_Vein_GrabFeatureFromFullImg(
                self.pDevHandle,
                pGrayImgBuf,
                img.shape[0],
                img.shape[1],
                liveness_flag,
                pRecgFeatBuf,
                ctypes.byref(ctypes.c_int(recg_feat_len)),
                ctypes.byref(cap_tip),
                ctypes.byref(palm_info),
                ctypes.byref(high_bright)
            )

            if ret == CA_PV_OK:
                if palm_info.status == 1:
                    self.add_log(
                        f"手掌位置: x={palm_info.x}, y={palm_info.y}, w={palm_info.width}, h={palm_info.height}, 亮度={palm_info.palm_bright}")

                # 比对特征
                best_score = float('inf')  # 初始化最佳分数为无穷大（距离越小越匹配）
                best_user_id = None
                best_user_name = None

                for user_id, palmVein in self.dicPalmVeins.items():
                    reg_feat = ctypes.c_void_p(palmVein.feat_buf.ctypes.data)
                    score = ctypes.c_float(0)

                    ret = xr_vein_api.XR_Vein_CalcFeatureDist(
                        reg_feat,
                        XR_VEIN_FEATURE_INFO_SIZE,
                        pRecgFeatBuf,
                        recg_feat_len,
                        ctypes.byref(score)
                    )

                    if ret != CA_PV_OK:
                        self.add_log(f"计算特征距离失败，错误码: {ret}")
                        continue

                    self.add_log(f"与用户 {getattr(palmVein, 'name', user_id)} 比对分数: {score.value}")

                    if score.value < best_score:
                        best_score = score.value
                        best_user_id = user_id
                        best_user_name = getattr(palmVein, 'name', user_id)

                if best_score < XR_VEIN_THRESH:
                    self.add_log(f"掌静脉比对成功！用户: {best_user_name}, 分数: {best_score}")
                    messagebox.showinfo("成功",
                                        f"掌静脉比对成功！\n用户ID: {best_user_id}\n姓名: {best_user_name}\n相似度分数: {best_score:.4f}")
                    self.isComparePalmVein = False
                else:
                    self.add_log(f"掌静脉比对失败，最佳分数: {best_score}")
                    messagebox.showinfo("提示",
                                        f"掌静脉比对失败\n最佳相似度分数: {best_score:.4f}\n阈值: {XR_VEIN_THRESH}")
            elif ret == -1:  # 假设低质量错误码为 -1
                self.showTip(cap_tip.value)
            else:
                if ret == -2:  # 假设无手错误码为 -2
                    self.add_log("未找到手掌，请调整位置")
                else:
                    self.add_log(f"特征提取失败，错误码: {ret}")
        except Exception as e:
            self.add_log(f"比对过程异常: {e}")
        finally:
            if self.checkCount > 30:  # 最多尝试30次
                messagebox.showinfo("提示", "掌静脉比对超时，请重试")
                self.isComparePalmVein = False
            self.btnRegister.config(state=tk.NORMAL)
            self.btnCompare.config(state=tk.NORMAL)
            self.IsPalmVeinProcessing = False

    def showTip(self, cap_tip):
        """显示操作提示"""
        tip_dict = {
            1: "请放入手掌",
            2: "请将手掌远离一些",
            3: "请将手掌靠近一些",
            4: "亮度异常，请调整环境光线",
            5: "请保持手掌姿势稳定",
            6: "请保持正确的手掌朝向",
            7: "请将手掌靠下一些",
            8: "请将手掌靠上一些",
            9: "请将手掌靠左一些",
            10: "请将手掌靠右一些",
            11: "采集成功",
            12: "注册成功"
        }

        if cap_tip in tip_dict:
            self.add_log(tip_dict[cap_tip])

    def savePalmVeins(self):
        """保存掌静脉数据到文件"""
        try:
            data = {}
            for key, palmVein in self.dicPalmVeins.items():
                data[key] = {
                    "name": getattr(palmVein, 'name', ''),
                    "regImgPaths": palmVein.regImgPaths,
                    "roiImgPath": palmVein.roiImgPath,
                    "feat_buf": palmVein.feat_buf.tolist()
                }

            with open('reg_img.bin', 'w') as f:
                json.dump(data, f)

            self.add_log(f"保存 {len(data)} 条掌静脉数据成功")
        except Exception as e:
            self.add_log(f"保存掌静脉数据失败: {e}")

    def loadPalmVeins(self):
        """从文件加载掌静脉数据"""
        try:
            if os.path.exists('reg_img.bin'):
                with open('reg_img.bin', 'r') as f:
                    data = json.load(f)
                    self.dicPalmVeins = {}

                    for key, value in data.items():
                        reg_img_paths = value['regImgPaths']
                        roi_img_path = value['roiImgPath']
                        feat_buf = np.array(value['feat_buf'], dtype=np.uint8)

                        palm_vein_info = PalmVeinInfo(reg_img_paths, roi_img_path, feat_buf)
                        palm_vein_info.userId = key

                        if 'name' in value:
                            palm_vein_info.name = value['name']

                        self.dicPalmVeins[key] = palm_vein_info

                    self.add_log(f"加载 {len(data)} 条掌静脉数据成功")
                    self.update_user_list()
            else:
                self.add_log("未找到保存的掌静脉数据")
        except Exception as e:
            self.add_log(f"加载掌静脉数据失败: {e}")

    def update_user_list(self):
        """更新用户列表"""
        self.userList.delete(0, tk.END)
        for user_id, palmVein in self.dicPalmVeins.items():
            name = getattr(palmVein, 'name', user_id)
            self.userList.insert(tk.END, f"{name} ({user_id})")

    def on_user_selected(self, event):
        """用户选择事件处理"""
        selection = self.userList.curselection()
        if not selection:
            return

        index = selection[0]
        user_id = list(self.dicPalmVeins.keys())[index]
        palmVein = self.dicPalmVeins[user_id]

        # 显示用户信息
        info = f"用户ID: {user_id}\n"
        info += f"姓名: {getattr(palmVein, 'name', '未知')}\n"
        info += f"注册图像: {len([p for p in palmVein.regImgPaths if p])}张\n"
        info += f"ROI图像: {os.path.basename(palmVein.roiImgPath) if palmVein.roiImgPath else '无'}"

        messagebox.showinfo("用户信息", info)

    def DelegatePalmVeinInfo(self, palmVeinInfo):
        """删除掌静脉信息"""
        try:
            if palmVeinInfo:
                # 删除相关图像文件
                if palmVeinInfo.regImgPaths:
                    for path in palmVeinInfo.regImgPaths:
                        if path and os.path.exists(path):
                            os.remove(path)

                if palmVeinInfo.roiImgPath and os.path.exists(palmVeinInfo.roiImgPath):
                    os.remove(palmVeinInfo.roiImgPath)

                # 从字典中删除
                if palmVeinInfo.userId in self.dicPalmVeins:
                    del self.dicPalmVeins[palmVeinInfo.userId]
                    self.update_user_list()
                    self.savePalmVeins()

                self.add_log(f"删除掌静脉信息: {getattr(palmVeinInfo, 'name', palmVeinInfo.userId)}")
        except Exception as e:
            self.add_log(f"删除掌静脉信息异常: {e}")

    def XR_BSP_Chip_SM2Decrypt22(self, inBuf, inLen, outBuf, outLen):
        """解密许可证"""
        if (inLen < 97) or (inLen > 246):
            return -1

        if outLen is None:
            return -1

        # self.add_log(f"删除掌静脉信息异常: {outLen.value}")
        # return -1
        # try:
        #     if outLen.contents.value < 1:
        #         return -1
        # except AttributeError:
        #     return -1

        # crcVal = 0
        # cmdLen = inLen + 5
        #
        # # 初始化发送缓冲区
        # chipSendBuf = [0] * (inLen + 10)
        # chipSendBuf[0] = 0x00
        # chipSendBuf[1] = (cmdLen >> 8) & 0xff
        # chipSendBuf[2] = cmdLen & 0xff
        #
        # chipSendBuf[3] = 0x00
        # chipSendBuf[4] = 0xE1
        # chipSendBuf[5] = 0x01
        # chipSendBuf[6] = (inLen >> 8) & 0xff
        # chipSendBuf[7] = inLen & 0xff
        #
        # # 复制输入数据到发送缓冲区
        # for i in range(inLen):
        #     chipSendBuf[i + 8] = inBuf[i]
        #
        #     # 计算CRC校验值
        # # crc_data = chipSendBuf[3:3 + cmdLen]
        #
        # # 计算CRC校验值前，确保 crc_data 中的每个值都在 uint8 范围内
        # crc_data = [b & 0xFF for b in chipSendBuf[3:3 + cmdLen]]  # 确保每个字节在 uint8 范围内
        # crcVal = self.XR_CalcCRC16_CCITT(crc_data, cmdLen)
        #
        # # 添加CRC校验值到发送缓冲区
        # chipSendBuf[inLen + 8] = (crcVal >> 8) & 0xff
        # chipSendBuf[inLen + 9] = crcVal & 0xff
        #
        # # 发送数据
        # ret = self.send_data(chipSendBuf, inLen + 10)
        # if ret != 0:
        #     return ret
        #
        # import time
        # time.sleep(0.1)
        #
        # # 接收数据
        # pkt_len = outLen[0] + 7
        # chipRecvBuf = [0] * pkt_len
        # ret = self.recv_data(chipRecvBuf, pkt_len)
        #
        # if ret == 0:
        #     # 复制接收到的数据到输出缓冲区
        #     for i in range(outLen[0]):
        #         outBuf[i] = chipRecvBuf[3 + i]
        #
        # return ret
        return 2


    def xr_bsp_chip_sm2_decrypt(self, in_buf, in_len, out_buf, out_len):
        """解密许可证数据"""
        if in_len.value < 97 or in_len.value > 246:
            return -1
        if not out_len or out_len.value < 1:
            return -1

        # 创建发送缓冲区
        chip_send_buf = (ctypes.c_byte * 1024)()
        chip_recv_buf = (ctypes.c_byte * 1024)()

        # 构造发送数据帧
        cmd_len = in_len.value + 5
        chip_send_buf[0] = 0x00
        chip_send_buf[1] = (cmd_len >> 8) & 0xFF
        chip_send_buf[2] = cmd_len & 0xFF
        chip_send_buf[3] = 0x00
        chip_send_buf[4] = 0xE1
        chip_send_buf[5] = 0x01
        chip_send_buf[6] = (in_len.value >> 8) & 0xFF
        chip_send_buf[7] = in_len.value & 0xFF

        # 复制输入数据
        for i in range(in_len.value):
            chip_send_buf[i + 8] = in_buf[i]

        # 计算CRC16校验
        # 创建一个Python列表用于CRC计算
        crc_data = []
        for i in range(cmd_len):
            crc_data.append(chip_send_buf[3 + i])
            
        crc_val = self.calc_crc16_ccitt(crc_data, cmd_len)
        chip_send_buf[in_len.value + 8] = (crc_val >> 8) & 0xFF
        chip_send_buf[in_len.value + 9] = crc_val & 0xFF

        # 发送数据
        send_ret = self.send_data(chip_send_buf, in_len.value + 10)
        if send_ret != CA_PV_OK:
            return send_ret

        # 等待响应
        time.sleep(0.1)

        # 接收数据
        pkt_len = out_len.value + 7
        ret = self.recv_data(chip_recv_buf, pkt_len)

        if ret == CA_PV_OK:
            # 将接收到的数据复制到输出缓冲区，并确保所有字节值为正数
            for i in range(out_len.value):
                # 使用 & 0xFF 确保字节值在 0-255 范围内
                byte_val = chip_recv_buf[3 + i] & 0xFF
                out_buf[i] = byte_val

        return ret

    # 计算 CRC16-CCITT 校验值 确保数据在通信过程中未被破坏
    def calc_crc16_ccitt(self, data, length):
        CRC16_CCITT_TAB = [
            0x0000, 0x1189, 0x2312, 0x329b, 0x4624, 0x57ad, 0x6536, 0x74bf,
            0x8c48, 0x9dc1, 0xaf5a, 0xbed3, 0xca6c, 0xdbe5, 0xe97e, 0xf8f7,
            0x1081, 0x0108, 0x3393, 0x221a, 0x56a5, 0x472c, 0x75b7, 0x643e,
            0x9cc9, 0x8d40, 0xbfdb, 0xae52, 0xdaed, 0xcb64, 0xf9ff, 0xe876,
            0x2102, 0x308b, 0x0210, 0x1399, 0x6726, 0x76af, 0x4434, 0x55bd,
            0xad4a, 0xbcc3, 0x8e58, 0x9fd1, 0xeb6e, 0xfae7, 0xc87c, 0xd9f5,
            0x3183, 0x200a, 0x1291, 0x0318, 0x77a7, 0x662e, 0x54b5, 0x453c,
            0xbdcb, 0xac42, 0x9ed9, 0x8f50, 0xfbef, 0xea66, 0xd8fd, 0xc974,
            0x4204, 0x538d, 0x6116, 0x709f, 0x0420, 0x15a9, 0x2732, 0x36bb,
            0xce4c, 0xdfc5, 0xed5e, 0xfcd7, 0x8868, 0x99e1, 0xab7a, 0xbaf3,
            0x5285, 0x430c, 0x7197, 0x601e, 0x14a1, 0x0528, 0x37b3, 0x263a,
            0xdecd, 0xcf44, 0xfddf, 0xec56, 0x98e9, 0x8960, 0xbbfb, 0xaa72,
            0x6306, 0x728f, 0x4014, 0x519d, 0x2522, 0x34ab, 0x0630, 0x17b9,
            0xef4e, 0xfec7, 0xcc5c, 0xddd5, 0xa96a, 0xb8e3, 0x8a78, 0x9bf1,
            0x7387, 0x620e, 0x5095, 0x411c, 0x35a3, 0x242a, 0x16b1, 0x0738,
            0xffcf, 0xee46, 0xdcdd, 0xcd54, 0xb9eb, 0xa862, 0x9af9, 0x8b70,
            0x8408, 0x9581, 0xa71a, 0xb693, 0xc22c, 0xd3a5, 0xe13e, 0xf0b7,
            0x0840, 0x19c9, 0x2b52, 0x3adb, 0x4e64, 0x5fed, 0x6d76, 0x7cff,
            0x9489, 0x8500, 0xb79b, 0xa612, 0xd2ad, 0xc324, 0xf1bf, 0xe036,
            0x18c1, 0x0948, 0x3bd3, 0x2a5a, 0x5ee5, 0x4f6c, 0x7df7, 0x6c7e,
            0xa50a, 0xb483, 0x8618, 0x9791, 0xe32e, 0xf2a7, 0xc03c, 0xd1b5,
            0x2944, 0x38cb, 0x0a50, 0x1bd9, 0x6f66, 0x7eef, 0x4c74, 0x5dfd,
            0xb58b, 0xa402, 0x9699, 0x8710, 0xf3af, 0xe226, 0xd0bd, 0xc134,
            0x39c3, 0x284a, 0x1ad1, 0x0b58, 0x7fe7, 0x6e6e, 0x5cf5, 0x4d7c,
            0xc60c, 0xd785, 0xe51e, 0xf497, 0x8028, 0x91a1, 0xa33a, 0xb2b3,
            0x4a44, 0x5bcd, 0x6956, 0x78df, 0x0c60, 0x1de9, 0x2f72, 0x3efb,
            0xd68d, 0xc704, 0xf59f, 0xe416, 0x90a9, 0x8120, 0xb3bb, 0xa232,
            0x5ac5, 0x4b4c, 0x79d7, 0x685e, 0x1ce1, 0x0d68, 0x3ff3, 0x2e7a,
            0xe70e, 0xf687, 0xc41c, 0xd595, 0xa12a, 0xb0a3, 0x8238, 0x93b1,
            0x6b46, 0x7acf, 0x4854, 0x59dd, 0x2d62, 0x3ceb, 0x0e70, 0x1ff9,
            0xf78f, 0xe606, 0xd49d, 0xc514, 0xb1ab, 0xa022, 0x92b9, 0x8330,
            0x7bc7, 0x6a4e, 0x58d5, 0x495c, 0x3de3, 0x2c6a, 0x1ef1, 0x0f78
        ]

        crc = 0x0000
        for i in range(length):
            # 确保数据是无符号字节
            byte_val = data[i] & 0xFF if isinstance(data[i], int) else ord(data[i]) & 0xFF
            # 确保索引在有效范围内
            index = (crc ^ byte_val) & 0xFF
            crc = (crc >> 8) ^ CRC16_CCITT_TAB[index]
        return crc


    def send_data(self, data_buf, param_len):
        """发送数据到设备"""
        if self.devIndex < 0 or self.devIndex >= len(self.devList):
            return -1  # CA_PV_ERR

        # 获取设备指针
        dev_ptr = self.devList[self.devIndex][1]
        
        trigFlag = ctypes.c_byte(0x00)
        len_ = ctypes.c_byte(param_len & 0xFF)

        # 读取触发标志
        ret = sonix_camera_api.SonixCam_AsicRegisterRead(
            dev_ptr,
            0x0B07,
            ctypes.byref(trigFlag),
            1
        )

        if not ret:
            return -1  # 假设 USB 传输错误码为 -1

        # 写入长度寄存器
        ret = sonix_camera_api.SonixCam_AsicRegisterWrite(
            dev_ptr,
            0xB06,
            ctypes.byref(len_),
            1
        )

        if not ret:
            return -1

        # 写入数据 (注意：这里应该是写入0xB08，而不是0xB07)
        ret = sonix_camera_api.SonixCam_AsicRegisterWrite(
            dev_ptr,
            0xB08,
            data_buf,
            len_.value
        )

        if not ret:
            return -1

        # 触发传输
        trigFlag = ctypes.c_byte(0x00)
        ret = sonix_camera_api.SonixCam_AsicRegisterWrite(
            dev_ptr,
            0xB07,
            ctypes.byref(trigFlag),
            1
        )

        if not ret:
            return -1

        time.sleep(0.1)  # 等待100ms
        return CA_PV_OK

    def recv_data(self, data_buf, param_len):
        """从设备接收数据"""
        if self.devIndex < 0 or self.devIndex >= len(self.devList):
            return -1
            
        # 获取设备指针
        dev_ptr = self.devList[self.devIndex][1]

        len_ = ctypes.c_byte(param_len & 0xFF)
        trig_flag = ctypes.c_byte(0)

        time.sleep(0.1)  # Sleep(100) 等效于 0.1 秒

        # 读取触发标志
        res = sonix_camera_api.SonixCam_AsicRegisterRead(
            dev_ptr, 0x0B07, ctypes.byref(trig_flag), 1
        )
        if not res:
            print("read trig flag failed")
            return -3  # PV_ERR_USB_TRANSFER 的等价错误码

        # 写入长度值
        res = sonix_camera_api.SonixCam_AsicRegisterWrite(
            dev_ptr, 0xB06, ctypes.byref(len_), 1
        )
        if not res:
            print(f"read len failed: {res}")
            return -3

        trig_flag = ctypes.c_byte(0x01)
        # 开始读取
        res = sonix_camera_api.SonixCam_AsicRegisterWrite(
            dev_ptr, 0xB07, ctypes.byref(trig_flag), 1
        )
        if not res:
            print(f"start read failed: {res}")
            return -3

        time.sleep(0.2)  # Sleep(200)

        # 读取最终数据
        res = sonix_camera_api.SonixCam_AsicRegisterRead(
            dev_ptr, 0xB08, data_buf, len_.value
        )
        if not res:
            print(f"read data failed: {res}")
            return -3

        return CA_PV_OK  # 成功返回 OK

    def read_register_data(self):
        len_ = 10  # 假设我们想读取 10 个字节的数据
        data_ptr = ctypes.POINTER(ctypes.c_byte)()

        res = sonix_camera_api.SonixCam_AsicRegisterRead(
            self.devList[self.devIndex][1],
            0xB08,
            ctypes.byref(data_ptr),  # 使用转换后的 LP_c_byte 指针
            len_
        )

        if res == 0:  # 假设 0 表示成功
            # 解引用指针并输出 data_ptr 所指向的数据
            read_data = [data_ptr[i] for i in range(len_)]
            print("data_ptr 的值:", read_data)
        else:
            raise Exception("Failed to read register data")

    def on_closing(self):
        """窗口关闭时的清理操作"""
        if messagebox.askokcancel("退出", "确定要退出掌静脉识别系统吗？"):
            # 关闭摄像头
            if self.devIndex >= 0 and self.devIndex < len(self.devList):
                # 获取设备指针
                dev_ptr = self.devList[self.devIndex][1]
                if sonix_camera_api.SonixCam_IsOpened(dev_ptr):
                    if sonix_camera_api.SonixCam_IsPreviewing(dev_ptr):
                        sonix_camera_api.SonixCam_StopPreview(dev_ptr)
                    sonix_camera_api.SonixCam_CloseCamera(dev_ptr)

            # 保存掌静脉数据
            self.savePalmVeins()

            # 关闭窗口
            self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    app = App(root)
    root.mainloop()