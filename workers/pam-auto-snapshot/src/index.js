// The early run defers accounts whose prices are stale or fell back; the final run writes them anyway.
const PHASE_BY_CRON = {
    '30 23 * * *': 'early',
    '30 1 * * *': 'final'
};

export default {
    async scheduled(event, env, ctx) {
        const phase = PHASE_BY_CRON[event.cron] || 'final';
        if (!env.PAM_JOB_URL || !env.PAM_JOB_SECRET) throw new Error('PAM_JOB_URL and PAM_JOB_SECRET must be configured');

        const response = await fetch(env.PAM_JOB_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env.PAM_JOB_SECRET}`,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({ phase })
        });
        const text = await response.text();
        // A non-2xx status throws so the run shows as failed in the Workers dashboard.
        if (!response.ok) throw new Error(`auto-snapshot ${phase} failed: HTTP ${response.status} ${text.slice(0, 200)}`);
        console.log(`auto-snapshot ${phase}`, text);
    }
};
