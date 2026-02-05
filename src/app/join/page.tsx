import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getInviteByToken, getTeamById } from '@/lib/db';
import JoinButton from './JoinButton';

interface JoinPageProps {
    searchParams: Promise<{ token?: string }>;
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
    const { token } = await searchParams;

    if (!token) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4">
                <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center border border-gray-200">
                    <h1 className="text-xl font-bold text-red-600 mb-2">Invalid Invite</h1>
                    <p className="text-gray-600">No invite token provided.</p>
                </div>
            </div>
        );
    }

    const session = await getSession();

    if (!session) {
        redirect(`/login?callbackUrl=${encodeURIComponent(`/join?token=${token}`)}`);
    }

    const invite = await getInviteByToken(token);

    if (!invite) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4">
                <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center border border-gray-200">
                    <h1 className="text-xl font-bold text-red-600 mb-2">Invalid Invite</h1>
                    <p className="text-gray-600">The invite link is invalid or has expired.</p>
                </div>
            </div>
        );
    }

    if (invite.expiresAt < new Date()) {
         return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4">
                <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center border border-gray-200">
                    <h1 className="text-xl font-bold text-red-600 mb-2">Invite Expired</h1>
                    <p className="text-gray-600">This invite link has expired.</p>
                </div>
            </div>
        );
    }

    const team = await getTeamById(invite.teamId);

    if (!team) {
         return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4">
                <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center border border-gray-200">
                    <h1 className="text-xl font-bold text-red-600 mb-2">Team Not Found</h1>
                    <p className="text-gray-600">The team associated with this invite no longer exists.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
            <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center border border-gray-200">
                <div className="mb-6">
                    {team.avatarUrl ? (
                        <img
                            src={team.avatarUrl}
                            alt={team.name}
                            className="w-16 h-16 rounded-full mx-auto"
                        />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-gray-200 mx-auto flex items-center justify-center text-2xl font-bold text-gray-500">
                            {team.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>
                <h1 className="text-2xl font-bold mb-2">Join {team.name}</h1>
                <p className="text-gray-600 mb-6">
                    You have been invited to join <strong>{team.name}</strong> on Deployify.
                </p>

                <JoinButton token={token} teamName={team.name} />
            </div>
        </div>
    );
}
