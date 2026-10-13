import { Link } from 'react-router';

export function NotFound({ message = "That page doesn't exist." }: { message?: string }) {
  return (
    <section className="home">
      <h1>Nothing here</h1>
      <p>{message}</p>
      <p>
        <Link to="/">Back to your projects</Link>
      </p>
    </section>
  );
}
