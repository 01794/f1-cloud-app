# gcs_client.py
from google.cloud import storage
import json


class GCSClient:
    def __init__(self, bucket_name="f1-cloud-lvtl-cache"):
        self.client = storage.Client.from_service_account_json(
            "f1-cloud-lvtl-firebase-adminsdk-fbsvc-978b212e8f.json"
        )
        self.bucket = self.client.bucket(bucket_name)

    def upload_json(self, bucket_name, object_name, data):
        bucket = self.client.bucket(bucket_name)
        blob = bucket.blob(object_name)
        blob.upload_from_string(json.dumps(data), content_type="application/json")
        print(f"Upload concluído: gs://{bucket_name}/{object_name}")

    def upload_bytes(self, filename, data, content_type="application/octet-stream"):
        blob = self.bucket.blob(filename)
        blob.upload_from_string(data, content_type=content_type)
        url = blob.generate_signed_url(
            version="v4", expiration=3600 * 24 * 365 * 100, method="GET"
        )
        return {"url": url, "fileName": filename}
