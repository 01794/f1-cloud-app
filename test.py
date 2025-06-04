from gcs_client import GCSClient

gcs = GCSClient()
gcs.upload_json("f1-cloud-lvtl-cache", "teste/teste.json", {"ok": True})
