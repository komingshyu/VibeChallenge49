export const CONFIG = {
    PORT: parseInt(process.env.PORT || "8787", 10),
    NODE_ENV: process.env.NODE_ENV || "development",
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || "",
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || "",
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    TAIWAN_BBOX: { minLon: 116.0, minLat: 20.0, maxLon: 126.0, maxLat: 27.0 }
};
