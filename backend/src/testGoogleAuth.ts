import prisma from './config/database';
import app from './app';
import http from 'http';

async function testGoogleAuth() {
  console.log('--- Starting Google Auth Integration Test ---');

  // Start Express app on a dynamic port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Clean up old test data
    console.log('Cleaning up existing Google test users...');
    await prisma.user.deleteMany({
      where: {
        email: { in: ['test_google_1@dogether.com', 'test_google_2@dogether.com'] }
      }
    });

    // 2. Test First-Time Login (Find-or-Create: Signup Flow)
    console.log('Testing First-Time Google Sign-In...');
    const signupRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'mock_token_test_google_1@dogether.com' })
    });

    const signupData: any = await signupRes.json();
    console.log('Signup response status:', signupRes.status);
    console.log('Signup message:', signupData.message);

    if (signupRes.status !== 200 || !signupData.token || signupData.user.email !== 'test_google_1@dogether.com') {
      throw new Error('First-time Google Sign-In / Signup failed.');
    }
    console.log('✅ First-time Sign-In (automatic registration) passed!');

    // 3. Test Returning User Login (Find-or-Create: Login Flow)
    console.log('Testing Returning Google Sign-In...');
    const loginRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'mock_token_test_google_1@dogether.com' })
    });

    const loginData: any = await loginRes.json();
    console.log('Login response status:', loginRes.status);
    console.log('Login message:', loginData.message);

    if (loginRes.status !== 200 || !loginData.token || loginData.user.id !== signupData.user.id) {
      throw new Error('Returning Google Sign-In failed.');
    }
    console.log('✅ Returning Sign-In passed!');

    // 4. Verify profile lookup via the generated JWT
    console.log('Testing Profile lookup via generated JWT...');
    const profileRes = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${loginData.token}`
      }
    });

    const profileData: any = await profileRes.json();
    console.log('Profile fetch response status:', profileRes.status);
    console.log('Profile data name:', profileData.user?.name);

    if (profileRes.status !== 200 || profileData.user?.email !== 'test_google_1@dogether.com') {
      throw new Error('User profile query via JWT failed.');
    }
    console.log('✅ JWT Authorization and Profile Fetch passed!');

    console.log('🎉 ALL GOOGLE AUTH TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('❌ Google Auth Test Failed:', error);
  } finally {
    // 5. Clean up database records
    console.log('Cleaning up Google test users...');
    await prisma.user.deleteMany({
      where: {
        email: { in: ['test_google_1@dogether.com', 'test_google_2@dogether.com'] }
      }
    });
    server.close();
    await prisma.$disconnect();
    console.log('--- Google Auth Test Completed ---');
  }
}

testGoogleAuth();
