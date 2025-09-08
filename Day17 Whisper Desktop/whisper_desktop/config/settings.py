from dataclasses import dataclass

LANG_TO_INIT_PROMPT = {
    "繁體中文":"#zh-TW 請以繁體中文輸出",
    "簡體中文":"#zh-CN",
    "English":"#en-US"
}

@dataclass
class AppSettings:
    language: str = "繁體中文"
    init_prompt: str = LANG_TO_INIT_PROMPT["繁體中文"]

    # toggles
    enable_denoise: bool = True
    enable_demucs: bool = False
    diarization: bool = False
    enable_polish: bool = True

    # backend/mode
    backend: str = "local"   # local/cloud
    mode: str = "batch"      # batch/realtime

    # whisper
    model_size: str = "large-v3"
    compute_type: str = "auto"

    # VAD defaults
    vad_threshold: float = 0.3
    min_speech_duration: float = 0.25
    max_silence_duration: float = 2.2

    # dirs
    save_dir: str = "./outputs"
    log_dir: str = "./logs"

    def apply_language(self, lang: str):
        self.language = lang
        self.init_prompt = LANG_TO_INIT_PROMPT.get(lang, "#en-US")
