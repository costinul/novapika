import type { PetRow, PlayerRow, Store } from '../server/store';

/** A Store kept in memory, for testing the server's rules without a database. */
export class MemoryStore implements Store {
  readonly playerRows = new Map<string, PlayerRow>();
  /** Token hash to player id. */
  readonly sessions = new Map<string, string>();
  readonly petRows = new Map<string, PetRow>();

  async addPlayer(player: PlayerRow): Promise<void> {
    this.playerRows.set(player.id, structuredClone(player));
  }
  async players(): Promise<PlayerRow[]> {
    return structuredClone([...this.playerRows.values()]);
  }
  async player(id: string): Promise<PlayerRow | null> {
    return structuredClone(this.playerRows.get(id) ?? null);
  }
  async playerByCodeHash(codeHash: string): Promise<PlayerRow | null> {
    return structuredClone([...this.playerRows.values()].find((p) => p.codeHash === codeHash) ?? null);
  }
  async replaceCode(playerId: string, codeHash: string): Promise<void> {
    this.playerRows.get(playerId)!.codeHash = codeHash;
    for (const [tokenHash, id] of this.sessions) if (id === playerId) this.sessions.delete(tokenHash);
  }
  async setFollower(playerId: string, petId: string | null): Promise<void> {
    this.playerRows.get(playerId)!.followerId = petId;
  }

  async addSession(tokenHash: string, playerId: string): Promise<void> {
    this.sessions.set(tokenHash, playerId);
  }
  async playerBySession(tokenHash: string): Promise<PlayerRow | null> {
    const id = this.sessions.get(tokenHash);
    return id ? this.player(id) : null;
  }

  async addPet(pet: PetRow): Promise<void> {
    this.petRows.set(pet.id, structuredClone(pet));
  }
  async pet(id: string): Promise<PetRow | null> {
    return structuredClone(this.petRows.get(id) ?? null);
  }
  async petsOf(ownerId: string): Promise<PetRow[]> {
    return structuredClone([...this.petRows.values()].filter((p) => p.ownerId === ownerId));
  }
  async allPets(): Promise<PetRow[]> {
    return structuredClone([...this.petRows.values()]);
  }
  async removePet(id: string): Promise<void> {
    this.petRows.delete(id);
  }
}
