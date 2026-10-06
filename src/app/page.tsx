import { redirect } from 'next/navigation';

/** The app has no landing page of its own; /files is the entry point. */
export default function HomePage() {
  redirect('/files');
}
