# voice

Players in a lobby talk to each other: always on, louder when closer, and from
the direction of the other parrot.

`Voice.ts` holds one WebRTC connection for each other player, straight between
the two games. Of any two players, the one in the lower lobby place rings the
other. The few messages it takes to set a call up travel through the lobby
(`rtc` in `shared/net.ts`); voices never do. Each voice is played through a
`PannerNode` placed at its parrot's head.

The microphone is `src/audio/Microphone.ts`, shared with mimicry. A voice is
sent only while there are calls, which is only while playing in a lobby.

The servers used to find a way between two players come from `GET /api/ice`:
Cloudflare's free STUN server, and its TURN relay when the server has a key.
