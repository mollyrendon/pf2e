export {};

declare global {
    /** An extension of the default PIXI.Polygon which is used to represent the line of sight for a point source. */
    abstract class PointSource<TObject extends PlaceableObject = PlaceableObject> {
        constructor(object: TObject);

        /** The object responsible for this source. */
        object: TObject;

        /** A flag for whether this source is currently active (rendered) or not */
        active: boolean;

        /** The object of data which configures how this source is rendered */
        data: Partial<LightSourceData>;

        /** The maximum radius of emission for this source */
        radius: number;

        /** The restricted line-of-sight polygon that is generated by the origin and radius of this source. */
        los: PointSourcePolygon<this>;

        /** A Graphics object with pre-computed geometry used for masking based on line-of-sight. */
        losMask: PIXI.Graphics;

        /** Is the angle of emission for this source limited? */
        limited: boolean;

        /** Boolean flags which control whether certain behaviors of the source must be enforced */
        protected _flags: Record<string, boolean>;

        fov: PIXI.Polygon;

        /** The x-coordinate of the point source origin. */
        get x(): number;

        /** The y-coordinate of the point source origin. */
        get y(): number;

        /** The type of source represented by this data structure. */
        get sourceType(): PointSourceType;

        /**
         * Create the structure of a source Container which can be rendered to the sight layer shadow-map
         * @return The constructed light source container
         */
        protected _createContainer(shaderCls: typeof PIXI.Shader): PIXI.Container;

        /* -------------------------------------------- */
        /*  Point Source Methods                        */
        /* -------------------------------------------- */

        /**
         * A point is contained with the area of the source if it is within both the FOV circle as well as the LOS polygon.
         * @param point The point to test
         * @returns Is the point contained
         */
        containsPoint(point: Point): boolean;

        /** Steps that must be performed when the base source is destroyed. */
        destroy(): void;

        /** Each subclass of PointSource must implement the initialize method */
        abstract initialize(data?: Partial<LightSourceData>): void;

        /**
         * Get power of 2 size pertaining to base-source radius and performance modes
         * @returns The computed power of 2 size
         */
        getPowerOf2Size(): number;

        /* -------------------------------------------- */
        /*  Rendering                                   */
        /* -------------------------------------------- */

        /**
         * Create a new Mesh for this source using a provided shader class
         * @param shaderCls The subclass of AdaptiveLightingShader being used for this Mesh
         * @returns The created Mesh
         */
        _createMesh(shaderCls: typeof AdaptiveLightingShader): PIXI.Mesh;

        /**
         * Update the position and size of the mesh each time it is drawn.
         * @param mesh The Mesh being updated
         * @returns The updated Mesh
         */
        protected _updateMesh(mesh: PIXI.Mesh): PIXI.Mesh;

        /** Render this source to a texture which can be used for masking and blurring. */
        protected _renderTexture(): PIXI.RenderTexture;

        /**
         * Create a container that should be rendered to the fov texture for this source
         * @returns The drawn container for the render texture
         */
        protected _drawRenderTextureContainer(): PIXI.Container;
    }

    type PointSourceType = "light" | "sight";

    type PointSourceData = LightSourceData | VisionSourceData;
}
