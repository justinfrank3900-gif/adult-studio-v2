import App from '@/components/App';

/* The studio is one screen. Everything below it is the client, because every
 * read and write goes out under the signed-in person's own token so that the
 * database's row rules are the thing deciding what they can touch. */
export const dynamic = 'force-dynamic';

export default function Page() {
  return <App />;
}
