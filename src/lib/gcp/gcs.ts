import { getGcpAccessToken } from './auth';

const GCS_API = 'https://storage.googleapis.com/storage/v1';

/**
 * Delete a file from Google Cloud Storage
 */
export async function deleteFile(gcsUri: string): Promise<void> {
    if (process.env.MOCK_DB === 'true') {
        console.log(`[GCS] MOCK: Deleting file ${gcsUri}`);
        return;
    }

    if (!gcsUri.startsWith('gs://')) {
        throw new Error('Invalid GCS URI');
    }

    const accessToken = await getGcpAccessToken();
    const [bucket, ...pathParts] = gcsUri.replace('gs://', '').split('/');
    const objectPath = encodeURIComponent(pathParts.join('/'));

    const response = await fetch(`${GCS_API}/b/${bucket}/o/${objectPath}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete GCS object: ${await response.text()}`);
    }
}

/**
 * Delete a folder (all objects with a prefix) from Google Cloud Storage
 */
export async function deleteFolder(gcsUri: string): Promise<void> {
    if (process.env.MOCK_DB === 'true') {
        console.log(`[GCS] MOCK: Deleting folder ${gcsUri}`);
        return;
    }

    if (!gcsUri.startsWith('gs://')) {
        throw new Error('Invalid GCS URI');
    }

    const accessToken = await getGcpAccessToken();
    const [bucket, ...pathParts] = gcsUri.replace('gs://', '').split('/');
    const prefix = pathParts.join('/');

    let nextPageToken: string | undefined;

    do {
        // 1. List objects with prefix (handling pagination)
        const url = `${GCS_API}/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
        const listResponse = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!listResponse.ok) {
            if (listResponse.status === 404) return;
            throw new Error(`Failed to list GCS objects: ${await listResponse.text()}`);
        }

        const data = await listResponse.json();
        const items = data.items || [];
        nextPageToken = data.nextPageToken;

        // 2. Delete each object in the current page
        await Promise.all(items.map(async (item: { name: string }) => {
            const delResponse = await fetch(`${GCS_API}/b/${bucket}/o/${encodeURIComponent(item.name)}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            if (!delResponse.ok && delResponse.status !== 404) {
                console.warn(`[GCS] Failed to delete object ${item.name}: ${await delResponse.text()}`);
            }
        }));
    } while (nextPageToken);
}
