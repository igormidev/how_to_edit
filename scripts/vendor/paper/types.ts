/** Minimal erased types required by the Torn renderer. */
export type TornAssemblyFlow = "center" | "top-down" | "bottom-up" | "left-right" | "right-left";
export type TornPieceMotion = "direct" | "riffle";
export interface VideoSettings { tornFlow: TornAssemblyFlow; tornMotion: TornPieceMotion }
