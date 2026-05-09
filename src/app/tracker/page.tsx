'use client';

import dynamic from 'next/dynamic';

const TrackerMap = dynamic(() => import('@/components/TrackerMap'), { ssr: false });

export default function TrackerPage() {
  return <TrackerMap />;
}
