// Global test environment setup — runs before every test file
// Sets all required env vars so modules that read process.env at load-time
// receive valid values.

process.env.NODE_ENV             = 'test';
process.env.JWT_SECRET           = 'test_jwt_secret_minimum_32_characters_long';
process.env.REFRESH_TOKEN_SECRET = 'test_refresh_secret_minimum_32_chars';
process.env.JWT_EXPIRES_IN       = '1h';
process.env.REFRESH_TOKEN_EXPIRES_IN = '7d';
process.env.CLIENT_URL           = 'http://localhost:5173';
process.env.LOG_LEVEL            = 'silent';
