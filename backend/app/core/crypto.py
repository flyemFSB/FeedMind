"""API 密钥加密/解密工具。

使用 Fernet 对称加密，密钥来自 ENCRYPTION_KEY 环境变量。
未设置时使用内置开发密钥（重启后数据仍可解密，但不适用于生产环境）。
"""

import os
from base64 import urlsafe_b64encode

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# 内置开发密钥 —— 确保开发环境下重启容器后已有数据仍可解密。
# 生产环境务必在 .env 中设置 ENCRYPTION_KEY 覆盖此值。
_DEV_KEY = "dev-encryption-key-do-not-use-in-production"


def _derive_fernet_key(raw_key: str) -> bytes:
    """将任意长度的密钥通过 PBKDF2 派生为 32 字节 Fernet 密钥。"""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"feedmind-key-salt",
        iterations=600_000,
    )
    return urlsafe_b64encode(kdf.derive(raw_key.encode("utf-8")))


def _get_fernet() -> Fernet:
    """获取 Fernet 实例，密钥来自 ENCRYPTION_KEY 环境变量或内置开发密钥。"""
    raw_key = os.environ.get("ENCRYPTION_KEY") or _DEV_KEY
    return Fernet(_derive_fernet_key(raw_key))


def encrypt_value(plaintext: str) -> str:
    """加密明文字符串，返回 base64 编码的密文。"""
    if not plaintext:
        return ""
    fernet = _get_fernet()
    return fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_value(ciphertext: str) -> str:
    """解密 base64 编码的密文，返回明文字符串。"""
    if not ciphertext:
        return ""
    fernet = _get_fernet()
    return fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")