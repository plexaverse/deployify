import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import yaml from 'js-yaml';

/**
 * GET - Export storage configuration as Infrastructure as Code (IaC)
 * Supports: Terraform (HCL), Kubernetes (YAML), JSON, YAML, and .env
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storage = project.storageConfigs?.find(s => s.id === storageId);

        if (!storage) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const format = searchParams.get('format') || 'json';

        let connectionString = '';
        if (storage.connectionStringSecretId) {
            connectionString = await getSecretValue(storage.connectionStringSecretId) || '';
        }

        const envKey = storage.envKey || (
            storage.type === 'memorystore-redis' ? 'REDIS_URL' :
            storage.type === 'mongodb-atlas' ? 'MONGODB_URI' : 'DATABASE_URL'
        );

        let content = '';
        let contentType = 'text/plain';
        const sanitizedName = storage.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

        switch (format) {
            case 'terraform':
                content = `# Terraform Configuration for Deployify Connector: ${storage.name}\n`;
                content += `# Generated on ${new Date().toISOString()}\n\n`;

                if (storage.type.includes('cloud-sql')) {
                    const dbType = storage.type.includes('postgres') ? 'POSTGRES_15' : 'MYSQL_8_0';
                    content += `resource "google_sql_database_instance" "${sanitizedName}" {\n`;
                    content += `  name             = "${storage.metadata?.resourceName || sanitizedName}"\n`;
                    content += `  database_version = "${dbType}"\n`;
                    content += `  region           = "${storage.region || 'us-central1'}"\n`;
                    content += `  settings {\n`;
                    content += `    tier = "${storage.metadata?.tier || 'db-f1-micro'}"\n`;
                    if (storage.metadata?.highAvailability) {
                        content += `    availability_type = "REGIONAL"\n`;
                    }
                    if (storage.metadata?.pitrEnabled) {
                        content += `    backup_configuration {\n`;
                        content += `      enabled            = true\n`;
                        content += `      binary_log_enabled = true\n`;
                        content += `    }\n`;
                    }
                    content += `  }\n`;
                    content += `  deletion_protection = ${!!storage.metadata?.deletionProtection}\n`;
                    content += `}\n\n`;
                } else if (storage.type === 'memorystore-redis') {
                    content += `resource "google_redis_instance" "${sanitizedName}" {\n`;
                    content += `  name           = "${storage.metadata?.resourceName || sanitizedName}"\n`;
                    content += `  tier           = "BASIC"\n`;
                    content += `  memory_size_gb = ${storage.metadata?.memorySizeGb || 1}\n`;
                    content += `  region         = "${storage.region || 'us-central1'}"\n`;
                    content += `  authorized_network = "${storage.metadata?.vpcNetwork || 'default'}"\n`;
                    content += `}\n\n`;
                }

                content += `resource "google_secret_manager_secret" "${sanitizedName}_conn" {\n`;
                content += `  secret_id = "${storage.connectionStringSecretId || `deployify-${id}-${storageId}-conn`}"\n`;
                content += `  replication {\n    auto {}\n  }\n`;
                content += `}\n`;
                contentType = 'text/plain';
                break;

            case 'kubernetes':
                const k8sSecret = {
                    apiVersion: 'v1',
                    kind: 'Secret',
                    metadata: {
                        name: sanitizedName.replace(/_/g, '-'),
                        labels: {
                            'app.kubernetes.io/managed-by': 'deployify',
                            'deployify.com/project-id': id,
                            'deployify.com/storage-id': storageId
                        }
                    },
                    type: 'Opaque',
                    data: {
                        [envKey]: Buffer.from(connectionString).toString('base64')
                    }
                };
                content = yaml.dump(k8sSecret);
                contentType = 'application/x-yaml';
                break;

            case 'env':
                content = `# Deployify Connector: ${storage.name}\n`;
                content += `# Type: ${storage.type}\n`;
                content += `${envKey}="${connectionString}"\n`;
                contentType = 'text/plain';
                break;

            case 'yaml':
                content = yaml.dump({
                    deployify_connector: {
                        id: storage.id,
                        name: storage.name,
                        type: storage.type,
                        region: storage.region,
                        environment: storage.environment,
                        env_key: envKey,
                        connection_string: connectionString,
                        metadata: storage.metadata
                    }
                });
                contentType = 'application/x-yaml';
                break;

            case 'json':
            default:
                content = JSON.stringify({
                    id: storage.id,
                    name: storage.name,
                    type: storage.type,
                    region: storage.region,
                    environment: storage.environment,
                    envKey,
                    connectionString,
                    metadata: storage.metadata
                }, null, 2);
                contentType = 'application/json';
                break;
        }

        const extension = format === 'terraform' ? 'tf' : (format === 'kubernetes' || format === 'yaml' ? 'yaml' : (format === 'env' ? 'env' : 'json'));

        return new NextResponse(content, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="iac-${sanitizedName}.${extension}"`
            }
        });

    } catch (error) {
        console.error('IaC export error:', error);
        return NextResponse.json({ error: 'Internal server error during IaC export' }, { status: 500 });
    }
}
