
async function main() {
  // Set mock environment variables required by config
  process.env.GITHUB_CLIENT_ID = 'test-client-id';
  process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
  process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
  process.env.GCP_PROJECT_ID = 'test-project-id';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.GCP_REGION = 'us-central1';

  const { getBandwidthUsage, getBillableInstanceTime } = await import('../src/lib/gcp/metrics');

  console.log('Testing getBandwidthUsage...');
  try {
    const bandwidth = await getBandwidthUsage('test-service', 'us-central1');
    console.log('Bandwidth Usage (bytes):', bandwidth);
  } catch (error) {
    console.error('Error fetching bandwidth:', error);
  }

  console.log('Testing getBillableInstanceTime...');
  try {
    const billableTime = await getBillableInstanceTime('test-service', 'us-central1');
    console.log('Billable Instance Time (seconds):', billableTime);
  } catch (error) {
    console.error('Error fetching billable time:', error);
  }
}

main().catch(console.error);
