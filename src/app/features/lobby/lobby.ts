import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GAMES, GAME_ORDER, SPORTS, gameRaces } from '../../core/sports';
import { GameFlow } from '../../services/game-flow';
import { GameState } from '../../services/game-state';

const ICONS = { dogs: 'i-dog', horses: 'i-horse' } as const;

/** Lobby: one thumbnail tile per game (a venue of a sport), showing the still of its first race. */
@Component({
  selector: 'section[app-lobby]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'view view--lobby', 'aria-label': 'Lobby' },
  templateUrl: './lobby.html',
})
export class Lobby {
  private readonly state = inject(GameState);
  protected readonly flow = inject(GameFlow);

  protected readonly tiles = computed(() => GAME_ORDER.map(k => GAMES[k]).flatMap(g => {
    const races = gameRaces(g, this.state.races());
    if (!races.length) return [];
    const s = SPORTS[g.sport];
    const r = races[0];
    const thumb = new URL(r.thumb || r.poster, location.href).href;   // absolute: a var() url resolves against the stylesheet
    return [{
      key: g.key,
      venue: g.venue,
      brand: s.brand,
      icon: '#' + ICONS[s.key],
      meta: `${g.runners || r.runners} ${s.nouns} · ${r.distance}m · ${s.surface}`,
      thumb: `url('${thumb}')`,
      current: g.key === this.state.game(),
    }];
  }));
}
