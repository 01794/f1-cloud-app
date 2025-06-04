// gcs-client.js - Cliente para Google Cloud Storage
class GCSClient {
  constructor(bucketName = 'f1-cloud-lvtl-cache') {
    this.bucketName = bucketName;
    this.storage = new Storage({
      keyFilename: 'f1-cloud-lvtl-firebase-adminsdk-fbsvc-978b212e8f.json' // Arquivo de credenciais
    });
    this.bucket = this.storage.bucket(this.bucketName);
  }

  async uploadTelemetry(data) {
    const fileName = `telemetry_${new Date().toISOString()}.json`;
    const file = this.bucket.file(fileName);
    
    await file.save(JSON.stringify(data), {
      contentType: 'application/json'
    });
    
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '03-09-2491' // Data longa no futuro
    });
    
    return { url, fileName };
  }

  async getTelemetry(fileName) {
    const file = this.bucket.file(fileName);
    const [data] = await file.download();
    return JSON.parse(data.toString());
  }

  async listTelemetryFiles() {
    const [files] = await this.bucket.getFiles();
    return files.map(file => file.name);
  }
}

// Exportar instância configurada
export const gcsClient = new GCSClient();