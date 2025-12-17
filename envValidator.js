// backend/utils/envValidator.js
export const validateEnvironment = () => {
  const requiredEnvVars = [
    'MONGODB_URI'
  ];

  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    console.error('Please check your .env file');
    return false;
  }

  console.log('✅ All required environment variables are set');
  return true;
};