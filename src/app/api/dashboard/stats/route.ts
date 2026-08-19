import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const totalScans = await db.scanResult.count();
    const threatsBlocked = await db.scanResult.count({
      where: { verdict: { in: ['PHISHING', 'QUARANTINED'] } },
    });
    const phishingDetected = await db.scanResult.count({
      where: { verdict: 'PHISHING' },
    });
    const totalSafe = await db.scanResult.count({
      where: { verdict: 'SAFE' },
    });

    const stats = {
      scansToday: totalScans,
      threatsBlocked: threatsBlocked,
      phishingDetected: phishingDetected,
      apiHealth: '99.98%',
      avgLatencyMs: 12,
      safeScans: totalSafe,
    };

    return NextResponse.json({ success: true, stats });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch dashboard stats.' }, { status: 500 });
  }
}
