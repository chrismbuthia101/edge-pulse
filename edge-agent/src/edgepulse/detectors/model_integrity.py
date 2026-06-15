

import hashlib
import json
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

try:
    import keyring
except ImportError:
    keyring = None

from edgepulse.utils.log_handler import get_logger, EdgePulseError

logger = get_logger(__name__)


@dataclass
class ModelMetadata:
    model_id: str
    model_version: str
    model_type: str  # 'isolation_forest', 'autoencoder'
    file_path: str
    file_size: int
    sha256_hash: str
    signature: Optional[str]
    created_at: datetime
    verified_at: Optional[datetime]
    is_verified: bool
    verification_details: Dict[str, Any]


@dataclass
class IntegrityVerification:
    is_valid: bool
    model_id: str
    verification_time: datetime
    file_hash_match: bool
    signature_valid: bool
    version_match: bool
    details: Dict[str, Any]
    error_message: Optional[str]


class ModelIntegrityVerifier:

    def __init__(self, models_directory: Optional[str] = None):
        from edgepulse.utils.path_manager import PathManager

        if models_directory:
            self.models_directory = Path(models_directory)
        else:
            self.models_directory = PathManager().models_dir

        self.models_directory.mkdir(parents=True, exist_ok=True)

        self.integrity_db_path = self.models_directory / "integrity.json"
        self.integrity_data: Dict[str, ModelMetadata] = {}

        self.keyring_service = "edgepulse-models"
        self.keyring_signing_key = "model_signing_key"

        self._load_integrity_data()

        logger.info(f"Model integrity verifier initialized for: {self.models_directory}")

    def _load_integrity_data(self):
        try:
            if self.integrity_db_path.exists():
                with open(self.integrity_db_path, "r") as f:
                    data = json.load(f)

                for model_id, metadata in data.items():
                    metadata["created_at"] = datetime.fromisoformat(metadata["created_at"])
                    if metadata.get("verified_at"):
                        metadata["verified_at"] = datetime.fromisoformat(metadata["verified_at"])

                    self.integrity_data[model_id] = ModelMetadata(**metadata)

                logger.info(f"Loaded integrity data for {len(self.integrity_data)} models")
            else:
                logger.info("No existing integrity data found")

        except Exception as e:
            logger.error(f"Failed to load integrity data: {e}")
            self.integrity_data = {}

    def _save_integrity_data(self):
        try:
            serializable_data = {}
            for model_id, metadata in self.integrity_data.items():
                data_dict = asdict(metadata)
                data_dict["created_at"] = metadata.created_at.isoformat()
                if metadata.verified_at:
                    data_dict["verified_at"] = metadata.verified_at.isoformat()
                serializable_data[model_id] = data_dict

            with open(self.integrity_db_path, "w") as f:
                json.dump(serializable_data, f, indent=2)

            logger.info("Integrity data saved successfully")

        except Exception as e:
            logger.error(f"Failed to save integrity data: {e}")

    def _get_signing_key(self) -> Optional[str]:
        if not keyring:
            logger.warning("keyring not available, model signatures disabled")
            return None

        try:
            key = keyring.get_password(self.keyring_service, self.keyring_signing_key)
            if key:
                return key
        except Exception:
            pass

        import secrets

        new_key = secrets.token_urlsafe(32)

        try:
            keyring.set_password(self.keyring_service, self.keyring_signing_key, new_key)
            logger.info("Generated new model signing key")
            return new_key
        except Exception as e:
            logger.error(f"Failed to store signing key: {e}")
            return None

    def _calculate_file_hash(self, file_path: Path) -> str:
        try:
            hash_sha256 = hashlib.sha256()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
            return hash_sha256.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate file hash for {file_path}: {e}")
            raise EdgePulseError(f"Hash calculation failed: {e}")

    def _sign_model(self, model_data: Dict[str, Any]) -> Optional[str]:
        signing_key = self._get_signing_key()
        if not signing_key:
            return None

        try:
            import hmac
            import base64

            canonical_data = json.dumps(model_data, sort_keys=True, separators=(",", ":"))

            signature = hmac.new(
                signing_key.encode(),
                canonical_data.encode(),
                hashlib.sha256,
            ).digest()

            return base64.b64encode(signature).decode()

        except Exception as e:
            logger.error(f"Failed to sign model: {e}")
            return None

    def _verify_signature(self, model_data: Dict[str, Any], signature: str) -> bool:
        try:
            signing_key = self._get_signing_key()
            if not signing_key:
                return True

            import hmac
            import base64

            canonical_data = json.dumps(model_data, sort_keys=True, separators=(",", ":"))
            expected_signature = hmac.new(
                signing_key.encode(),
                canonical_data.encode(),
                hashlib.sha256,
            ).digest()

            stored_signature = base64.b64decode(signature)
            return hmac.compare_digest(expected_signature, stored_signature)

        except Exception as e:
            logger.error(f"Failed to verify signature: {e}")
            return False

    async def register_model(
        self,
        model_id: str,
        model_version: str,
        model_type: str,
        file_path: str,
    ) -> ModelMetadata:
        try:
            file_path_obj = Path(file_path)

            if not file_path_obj.exists():
                raise EdgePulseError(f"Model file not found: {file_path}")

            file_hash = self._calculate_file_hash(file_path_obj)
            file_size = file_path_obj.stat().st_size

            metadata = ModelMetadata(
                model_id=model_id,
                model_version=model_version,
                model_type=model_type,
                file_path=str(file_path_obj),
                file_size=file_size,
                sha256_hash=file_hash,
                signature=None,
                created_at=datetime.now(timezone.utc),
                verified_at=None,
                is_verified=False,
                verification_details={},
            )

            model_data = {
                "model_id": model_id,
                "model_version": model_version,
                "model_type": model_type,
                "file_hash": file_hash,
                "file_size": file_size,
                "created_at": metadata.created_at.isoformat(),
            }

            metadata.signature = self._sign_model(model_data)

            self.integrity_data[model_id] = metadata
            self._save_integrity_data()

            logger.info(f"Model registered: {model_id} (version {model_version})")
            return metadata

        except Exception as e:
            logger.error(f"Failed to register model {model_id}: {e}")
            raise EdgePulseError(f"Model registration failed: {e}")

    async def verify_model(self, model_id: str) -> IntegrityVerification:
        try:
            if model_id not in self.integrity_data:
                return IntegrityVerification(
                    is_valid=False,
                    model_id=model_id,
                    verification_time=datetime.now(timezone.utc),
                    file_hash_match=False,
                    signature_valid=False,
                    version_match=False,
                    details={},
                    error_message="Model not found in integrity database",
                )

            metadata = self.integrity_data[model_id]
            file_path = Path(metadata.file_path)

            verification_details = {}

            if not file_path.exists():
                return IntegrityVerification(
                    is_valid=False,
                    model_id=model_id,
                    verification_time=datetime.now(timezone.utc),
                    file_hash_match=False,
                    signature_valid=False,
                    version_match=False,
                    details={"file_missing": True},
                    error_message="Model file not found",
                )

            current_hash = self._calculate_file_hash(file_path)
            file_hash_match = current_hash == metadata.sha256_hash
            verification_details["expected_hash"] = metadata.sha256_hash
            verification_details["actual_hash"] = current_hash

            signature_valid = True
            if metadata.signature:
                model_data = {
                    "model_id": metadata.model_id,
                    "model_version": metadata.model_version,
                    "model_type": metadata.model_type,
                    "file_hash": current_hash,
                    "file_size": metadata.file_size,
                    "created_at": metadata.created_at.isoformat(),
                }
                signature_valid = self._verify_signature(model_data, metadata.signature)
            verification_details["signature_present"] = metadata.signature is not None
            verification_details["signature_valid"] = signature_valid

            version_match = True
            verification_details["version"] = metadata.model_version

            is_valid = file_hash_match and signature_valid and version_match

            metadata.verified_at = datetime.now(timezone.utc)
            metadata.is_verified = is_valid
            metadata.verification_details = verification_details
            self._save_integrity_data()

            result = IntegrityVerification(
                is_valid=is_valid,
                model_id=model_id,
                verification_time=datetime.now(timezone.utc),
                file_hash_match=file_hash_match,
                signature_valid=signature_valid,
                version_match=version_match,
                details=verification_details,
                error_message=None if is_valid else "Model integrity verification failed",
            )

            logger.info(
                f"Model verification completed: {model_id} -> {'VALID' if is_valid else 'INVALID'}"
            )
            return result

        except Exception as e:
            logger.error(f"Failed to verify model {model_id}: {e}")
            return IntegrityVerification(
                is_valid=False,
                model_id=model_id,
                verification_time=datetime.now(timezone.utc),
                    file_hash_match=False,
                signature_valid=False,
                version_match=False,
                details={},
                error_message=f"Verification error: {str(e)}",
            )

    async def verify_all_models(self) -> Dict[str, IntegrityVerification]:
        results = {}
        for model_id in self.integrity_data:
            results[model_id] = await self.verify_model(model_id)
        logger.info(f"Verified {len(results)} models")
        return results

    def get_model_metadata(self, model_id: str) -> Optional[ModelMetadata]:
        return self.integrity_data.get(model_id)

    def list_models(self) -> List[str]:
        return list(self.integrity_data.keys())

    def remove_model(self, model_id: str) -> bool:
        try:
            if model_id in self.integrity_data:
                del self.integrity_data[model_id]
                self._save_integrity_data()
                logger.info(f"Model removed from integrity database: {model_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to remove model {model_id}: {e}")
            return False

    async def cleanup_old_models(self, days_to_keep: int = 30):
        try:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_to_keep)

            models_to_remove = []
            for model_id, metadata in self.integrity_data.items():
                if metadata.created_at < cutoff_date:
                    if not Path(metadata.file_path).exists():
                        models_to_remove.append(model_id)

            for model_id in models_to_remove:
                self.remove_model(model_id)

            logger.info(f"Cleaned up {len(models_to_remove)} old model records")
            return len(models_to_remove)

        except Exception as e:
            logger.error(f"Failed to cleanup old models: {e}")
            return 0

    def get_integrity_report(self) -> Dict[str, Any]:
        try:
            total_models = len(self.integrity_data)
            verified_models = sum(1 for m in self.integrity_data.values() if m.is_verified)

            models_by_type: Dict[str, int] = {}
            for metadata in self.integrity_data.values():
                model_type = metadata.model_type
                models_by_type[model_type] = models_by_type.get(model_type, 0) + 1

            return {
                "total_models": total_models,
                "verified_models": verified_models,
                "unverified_models": total_models - verified_models,
                "models_by_type": models_by_type,
                "models_directory": str(self.models_directory),
                "last_verification": max(
                    (m.verified_at for m in self.integrity_data.values() if m.verified_at),
                    default=None,
                ),
            }

        except Exception as e:
            logger.error(f"Failed to generate integrity report: {e}")
            return {"error": str(e)}


def create_model_integrity_verifier(
    models_directory: Optional[str] = None,
) -> ModelIntegrityVerifier:
    return ModelIntegrityVerifier(models_directory)