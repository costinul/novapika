import type { PetRow, PlayerRow, RequestRow, Store, TalkRow } from '../server/store';

/** A Store kept in memory, for testing the server's rules without a database. */
export class MemoryStore implements Store {
  readonly playerRows = new Map<string, PlayerRow>();
  /** Token hash to player id. */
  readonly sessions = new Map<string, string>();
  readonly petRows = new Map<string, PetRow>();
  readonly requestRows = new Map<string, RequestRow>();
  talkRows: TalkRow[] = [];
  readonly settings = new Map<string, string>();

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
  async removePlayer(playerId: string): Promise<void> {
    for (const [id, request] of this.requestRows) {
      if (request.askerId === playerId || request.ownerId === playerId) this.requestRows.delete(id);
    }
    for (const [tokenHash, id] of this.sessions) if (id === playerId) this.sessions.delete(tokenHash);
    for (const [id, pet] of this.petRows) if (pet.ownerId === playerId) this.petRows.delete(id);
    this.talkRows = this.talkRows.filter((talk) => talk.playerId !== playerId);
    this.playerRows.delete(playerId);
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
  async updatePet(id: string, changes: Partial<Pick<PetRow, 'stage' | 'seeds' | 'freedAt'>>): Promise<void> {
    Object.assign(this.petRows.get(id)!, changes);
  }
  async removePet(id: string): Promise<void> {
    this.petRows.delete(id);
  }
  async removeFreedBefore(time: number): Promise<void> {
    for (const pet of this.petRows.values()) {
      if (pet.stage === 'freed' && pet.freedAt !== null && pet.freedAt < time) this.petRows.delete(pet.id);
    }
  }

  async addRequest(request: RequestRow): Promise<void> {
    this.requestRows.set(request.id, structuredClone(request));
  }
  async request(id: string): Promise<RequestRow | null> {
    return structuredClone(this.requestRows.get(id) ?? null);
  }
  async requestsBy(askerId: string): Promise<RequestRow[]> {
    return structuredClone([...this.requestRows.values()].filter((r) => r.askerId === askerId));
  }
  async requestsOf(ownerId: string): Promise<RequestRow[]> {
    return structuredClone([...this.requestRows.values()].filter((r) => r.ownerId === ownerId));
  }
  async removeRequest(id: string): Promise<void> {
    this.requestRows.delete(id);
  }
  async removeRequestsNaming(petId: string): Promise<void> {
    for (const request of this.requestRows.values()) {
      if (request.askerPetId === petId || request.askedPetId === petId) this.requestRows.delete(request.id);
    }
  }

  async addTalk(talk: TalkRow): Promise<void> {
    this.talkRows.push(structuredClone(talk));
  }
  async talk(limit: number): Promise<TalkRow[]> {
    return structuredClone([...this.talkRows].sort((a, b) => b.at - a.at).slice(0, limit));
  }
  async removeTalkBefore(time: number): Promise<void> {
    this.talkRows = this.talkRows.filter((talk) => talk.at >= time);
  }

  async setting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }
}
