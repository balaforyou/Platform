import { Card } from '../components';

/**
 * Placeholder for a not-yet-built destination (sub-slice 0.3). One generic component
 * instantiated per stub route — no near-duplicate files per destination. The route is
 * real and navigable; only the content is a stub.
 */
export function StubScreen({ title, description }: { title: string; description: string }) {
  return (
    <Card style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 var(--av2-space-2)', fontSize: 'var(--av2-text-lg)' }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)', lineHeight: 'var(--av2-leading-normal)' }}>
        {description}
      </p>
      <p style={{ margin: 'var(--av2-space-4) 0 0', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
        This screen isn’t built yet — the route and navigation are in place ahead of it.
      </p>
    </Card>
  );
}
