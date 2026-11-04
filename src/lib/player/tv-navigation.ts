/** TV focus navigation owns arrows and Space, so it is opt-in and stays off while locked or docked. */
export function playerTvNavigationEnabled(input: {
  tvNavigation: boolean;
  playerTvNavigation: boolean;
  screenLocked: boolean;
  pipDocked?: boolean;
}): boolean {
  return input.tvNavigation && input.playerTvNavigation && !input.screenLocked && !input.pipDocked;
}
