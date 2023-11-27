import { Launchpad } from "./launchpad";

export interface TileConstructorConfig {
    launchpad: Launchpad;
    /** ID of the Tile */
    id: string;
}

export class Tile {

    public readonly launchpad: Launchpad;

    public readonly id: string;

    constructor(options: TileConstructorConfig) {

        this.launchpad = options.launchpad;
        this.id = options.id;
    }
}