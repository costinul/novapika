import { BackSide, BufferAttribute, Color, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';

/** A dome of sky, pale at the horizon and deeper blue overhead. */
export function sky(horizon: number, zenith: number): Mesh {
  const dome = new SphereGeometry(400, 24, 12);
  const position = dome.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const low = new Color(horizon);
  const high = new Color(zenith);
  const c = new Color();
  for (let i = 0; i < position.count; i++) {
    const t = Math.min(1, Math.max(0, position.getY(i) / 400));
    c.lerpColors(low, high, Math.sqrt(t)).toArray(colors, i * 3);
  }
  dome.setAttribute('color', new BufferAttribute(colors, 3));
  return new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide, depthWrite: false }));
}
