# My HID Step Controls — Blender 4.4 add-on
#
# Blender's keymap UI often refuses to capture F13–F24, even though Blender's
# event system knows about them. This add-on registers the operators from Python
# and binds F13–F24 to fixed-step rotations and translations. My HID sends one
# key tap per ratchet step, so each tap moves by exactly one step.
#
# Install: Edit -> Preferences -> Add-ons -> Install from Disk, then enable
# "My HID Step Controls". The F13–F24 bindings are added to the 3D View keymap.
#
# Two targets:
#   Selected Objects - rotate/translate selected objects in object mode.
#   3D Viewport       - orbit/pan the view (not available in camera view).
#
# Three axis spaces for selected objects (preferences > Axis Space):
#   Global - the world axes.
#   Local  - each object's own axes.
#   Smart  - Z stays the world vertical, and the other two axes lie in the XY
#            plane: X points horizontally away from the camera toward the object
#            and Y is 90 degrees from it. So X/Y always move "into the screen"
#            and "left/right on screen" however far the camera has orbited,
#            while Z is still a turntable spin and a straight up/down move.
#            The scene camera is used in camera view, otherwise the 3D Viewport.
#
# The default mapping matches Hid's rx/ry/rz + tx/ty/tz defaults:
#   F13/F14 = rotate Y +/-
#   F15/F16 = rotate X +/-
#   F17/F18 = rotate Z +/-
#   F19/F20 = translate Y +/-
#   F21/F22 = translate X +/-
#   F23/F24 = translate Z +/-

bl_info = {
    "name": "My HID Step Controls",
    "author": "MyApps",
    "version": (1, 2, 0),
    "blender": (4, 4, 0),
    "location": "3D Viewport keymap (F13-F24)",
    "description": "Rotate or translate selected objects or the 3D view by fixed steps from My HID key taps",
    "category": "3D View",
}

import math

import bpy
from mathutils import Matrix, Quaternion, Vector

ADDON_ID = __name__ if __name__ != "__main__" else "hid_step_controls"

_AXIS_ITEMS = (
    ("X", "X", "X axis"),
    ("Y", "Y", "Y axis"),
    ("Z", "Z", "Z axis"),
)

_AXIS_ORDER = ("X", "Y", "Z")

_WORLD_AXES = {
    "X": Vector((1.0, 0.0, 0.0)),
    "Y": Vector((0.0, 1.0, 0.0)),
    "Z": Vector((0.0, 0.0, 1.0)),
}

_WORLD_UP = Vector((0.0, 0.0, 1.0))

# Below this length a direction has no usable horizontal component (the camera is
# looking straight down or straight up), so Smart space needs a fallback.
_SMART_EPSILON = 1e-4

# (key, axis, direction) for the default My HID F13–F18 rotation layout.
_ROTATION_BINDINGS = (
    ("F13", "Y", 1),
    ("F14", "Y", -1),
    ("F15", "X", 1),
    ("F16", "X", -1),
    ("F17", "Z", 1),
    ("F18", "Z", -1),
)

# (key, axis, direction) for the default My HID F19–F24 translation layout.
_TRANSLATION_BINDINGS = (
    ("F19", "Y", 1),
    ("F20", "Y", -1),
    ("F21", "X", 1),
    ("F22", "X", -1),
    ("F23", "Z", 1),
    ("F24", "Z", -1),
)

_KEYMAP_ITEMS = []


def _prefs():
    addon = bpy.context.preferences.addons.get(ADDON_ID)
    return getattr(addon, "preferences", None) if addon else None


def _step_degrees():
    prefs = _prefs()
    return max(0.01, float(getattr(prefs, "step_degrees", 5.0)))


def _step_distance():
    prefs = _prefs()
    return max(0.0001, float(getattr(prefs, "step_distance", 0.1)))


def _has_selected_parent(obj, selected):
    parent = obj.parent
    while parent is not None:
        if parent in selected:
            return True
        parent = parent.parent
    return False


def _region_3d(context):
    """The 3D Viewport's RegionView3D, or None outside a 3D View."""
    space = getattr(context, "space_data", None)
    return getattr(space, "region_3d", None)


def _scene_camera(context):
    scene = getattr(context, "scene", None)
    return getattr(scene, "camera", None) if scene is not None else None


def _in_camera_view(context):
    region = _region_3d(context)
    return region is not None and getattr(region, "view_perspective", "") == "CAMERA"


def _camera_location(camera):
    return camera.matrix_world.translation.copy()


def _camera_forward(camera):
    # Cameras look down their local -Z.
    return (camera.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))).normalized()


def _view_eye(context):
    """World-space eye of what the user is looking through, or None.

    Camera view uses the active scene camera (its eye is exact); otherwise the
    3D Viewport, whose eye comes from its own view matrix.
    """
    camera = _scene_camera(context)
    region = _region_3d(context)

    if _in_camera_view(context) and camera is not None:
        return _camera_location(camera)

    if region is not None:
        view_matrix = getattr(region, "view_matrix", None)
        if view_matrix is not None:
            try:
                return view_matrix.inverted().translation.copy()
            except Exception:
                pass
        rotation = getattr(region, "view_rotation", None)
        location = getattr(region, "view_location", None)
        distance = getattr(region, "view_distance", None)
        if rotation is not None and location is not None and distance is not None:
            return location + (rotation @ Vector((0.0, 0.0, 1.0))) * float(distance)

    if camera is not None:
        return _camera_location(camera)
    return None


def _view_forward(context):
    """Unit viewing direction (into the screen), or None when nothing is known."""
    camera = _scene_camera(context)
    region = _region_3d(context)

    if _in_camera_view(context) and camera is not None:
        return _camera_forward(camera)

    rotation = getattr(region, "view_rotation", None) if region is not None else None
    if rotation is not None:
        return (rotation @ Vector((0.0, 0.0, -1.0))).normalized()

    if camera is not None:
        return _camera_forward(camera)
    return None


def _view_right(context):
    """Unit screen-right direction of the current view, or None."""
    region = _region_3d(context)
    rotation = getattr(region, "view_rotation", None) if region is not None else None
    if rotation is not None:
        return (rotation @ Vector((1.0, 0.0, 0.0))).normalized()
    return None


def _flat(value):
    """Project a direction onto the XY plane; None when it has no horizontal part."""
    if value is None:
        return None
    flat = Vector((value.x, value.y, 0.0))
    return flat if flat.length >= _SMART_EPSILON else None


def _smart_horizontal_axis(context, center):
    """Unit horizontal direction pointing from the camera toward `center`.

    Falls back to the view direction (when only a rotation is known) and then to
    the viewport's own right axis, so a top-down camera still gets usable axes.
    """
    eye = _view_eye(context)
    if eye is not None:
        flat = _flat(center - eye)
        if flat is not None:
            return flat.normalized()

    flat = _flat(_view_forward(context))
    if flat is not None:
        return flat.normalized()

    flat = _flat(_view_right(context))
    if flat is not None:
        return flat.normalized()

    return Vector((0.0, 1.0, 0.0))


def _smart_basis(context, center):
    """(X, Y, Z) world axes for Smart space at `center`.

    Z is the world vertical. X points horizontally from the camera toward the
    object; Y is 90 degrees from it, still inside the XY plane.
    """
    x_axis = _smart_horizontal_axis(context, Vector(center))
    y_axis = x_axis.cross(_WORLD_UP)
    if y_axis.length < _SMART_EPSILON:
        # x_axis is horizontal by construction, so this cannot happen; keep the
        # fallback so a future change can never produce a zero axis.
        y_axis = Vector((1.0, 0.0, 0.0))
    return x_axis, y_axis.normalized(), _WORLD_UP.copy()


def _world_axis(context, axis, space, center):
    """World-space unit axis for one axis letter in the given space.

    Smart resolves against `center` (the pivot, or the object's own origin), so
    callers pass the point the basis must be built from.
    """
    if space == "SMART":
        return _smart_basis(context, center)[_AXIS_ORDER.index(axis)]
    return _WORLD_AXES.get(axis, _WORLD_AXES["X"]).copy()


def _pivot_point(context, objects, pivot_mode):
    """Shared world-space pivot for a non-individual rotation or Smart basis."""
    if pivot_mode == "CURSOR":
        return context.scene.cursor.location.copy()
    return sum((obj.matrix_world.translation for obj in objects), Vector()) / len(objects)


def _selected_root_objects(context):
    selected = set(context.selected_objects)
    if not selected:
        return []
    # If both a parent and its child are selected, transform the parent only;
    # transforming both would apply the parent's transform twice.
    objects = [obj for obj in selected if not _has_selected_parent(obj, selected)]
    return objects or list(selected)


def _push_object_undo(message):
    try:
        bpy.ops.ed.undo_push(message=message)
    except Exception:
        # Undo is a convenience; never let it break the transform itself.
        pass


class HID_OT_rotate_step(bpy.types.Operator):
    """Rotate selected objects or the 3D view by one fixed angular step."""

    bl_idname = "hid.rotate_step"
    bl_label = "My HID Step Rotate"
    bl_description = "Rotate by the configured step; bind a My HID key to this operator"
    # Object rotations push their own undo step. Viewport orbit is not undoable,
    # so a static UNDO option would make Ctrl+Z skip over it misleadingly.
    bl_options = {"REGISTER"}

    axis: bpy.props.EnumProperty(
        name="Axis",
        description="Rotation axis",
        items=_AXIS_ITEMS,
        default="X",
    )
    direction: bpy.props.IntProperty(
        name="Direction",
        description="+1 for positive rotation, -1 for negative",
        default=1,
        min=-1,
        max=1,
    )

    @classmethod
    def poll(cls, context):
        prefs = _prefs()
        if prefs and prefs.target == "VIEW":
            space = getattr(context, "space_data", None)
            return (
                space is not None
                and space.type == "VIEW_3D"
                and space.region_3d is not None
            )
        return context.mode == "OBJECT"

    def execute(self, context):
        prefs = _prefs()
        target = getattr(prefs, "target", "OBJECT")
        sign = 1 if self.direction >= 0 else -1
        angle = math.radians(_step_degrees()) * sign

        if target == "VIEW":
            return self._rotate_view(context, angle)
        return self._rotate_objects(context, angle)

    def _rotate_objects(self, context, angle):
        objects = _selected_root_objects(context)
        if not objects:
            self.report({"WARNING"}, "My HID: select at least one object")
            return {"CANCELLED"}

        prefs = _prefs()
        space = getattr(prefs, "space", "GLOBAL")
        pivot_mode = getattr(prefs, "pivot", "INDIVIDUAL")

        if space == "LOCAL":
            # Local rotation is always around each object's own origin. The
            # pivot preference only applies to global rotations. Right-
            # multiplying a WORLD-axis rotation is what makes it local.
            rotation = Matrix.Rotation(angle, 4, _WORLD_AXES.get(self.axis, _WORLD_AXES["X"]))
            for obj in objects:
                obj.matrix_world = obj.matrix_world @ rotation
        elif pivot_mode == "INDIVIDUAL":
            for obj in objects:
                location = obj.matrix_world.translation.copy()
                rotation = Matrix.Rotation(
                    angle, 4, _world_axis(context, self.axis, space, location)
                )
                around_object = (
                    Matrix.Translation(location)
                    @ rotation
                    @ Matrix.Translation(-location)
                )
                obj.matrix_world = around_object @ obj.matrix_world
        else:
            pivot = _pivot_point(context, objects, pivot_mode)
            rotation = Matrix.Rotation(
                angle, 4, _world_axis(context, self.axis, space, pivot)
            )
            around_pivot = (
                Matrix.Translation(pivot)
                @ rotation
                @ Matrix.Translation(-pivot)
            )
            for obj in objects:
                obj.matrix_world = around_pivot @ obj.matrix_world

        context.view_layer.update()
        _push_object_undo("My HID Step Rotate")
        return {"FINISHED"}

    def _rotate_view(self, context, angle):
        region_3d = context.space_data.region_3d
        if region_3d.view_perspective == "CAMERA":
            self.report({"WARNING"}, "My HID: leave camera view to orbit the view")
            return {"CANCELLED"}

        current = region_3d.view_rotation.copy()
        if self.axis == "X":
            # Pitch around the view's right vector.
            axis = current @ Vector((1.0, 0.0, 0.0))
        elif self.axis == "Y":
            # Turntable yaw around world Z.
            axis = Vector((0.0, 0.0, 1.0))
        else:
            # Roll around the view direction (cameras look down local -Z).
            axis = current @ Vector((0.0, 0.0, -1.0))

        delta = Quaternion(axis.normalized(), angle)
        region_3d.view_rotation = (delta @ current).normalized()
        if context.area:
            context.area.tag_redraw()
        return {"FINISHED"}


class HID_OT_translate_step(bpy.types.Operator):
    """Translate selected objects or the 3D view by one fixed distance step."""

    bl_idname = "hid.translate_step"
    bl_label = "My HID Step Translate"
    bl_description = "Move by the configured distance; bind a My HID key to this operator"
    bl_options = {"REGISTER"}

    axis: bpy.props.EnumProperty(
        name="Axis",
        description="Translation axis",
        items=_AXIS_ITEMS,
        default="X",
    )
    direction: bpy.props.IntProperty(
        name="Direction",
        description="+1 for positive translation, -1 for negative",
        default=1,
        min=-1,
        max=1,
    )

    @classmethod
    def poll(cls, context):
        prefs = _prefs()
        if prefs and prefs.target == "VIEW":
            space = getattr(context, "space_data", None)
            return (
                space is not None
                and space.type == "VIEW_3D"
                and space.region_3d is not None
            )
        return context.mode == "OBJECT"

    def execute(self, context):
        prefs = _prefs()
        target = getattr(prefs, "target", "OBJECT")
        sign = 1 if self.direction >= 0 else -1
        distance = _step_distance() * sign

        if target == "VIEW":
            return self._translate_view(context, distance)
        return self._translate_objects(context, distance)

    def _translate_objects(self, context, distance):
        objects = _selected_root_objects(context)
        if not objects:
            self.report({"WARNING"}, "My HID: select at least one object")
            return {"CANCELLED"}

        prefs = _prefs()
        space = getattr(prefs, "space", "GLOBAL")
        pivot_mode = getattr(prefs, "pivot", "INDIVIDUAL")

        if space == "LOCAL":
            axis = _WORLD_AXES.get(self.axis, _WORLD_AXES["X"])
            local_delta = Matrix.Translation(axis * distance)
            for obj in objects:
                obj.matrix_world = obj.matrix_world @ local_delta
        elif space == "SMART" and pivot_mode == "INDIVIDUAL":
            # Each object moves along its own camera ray, so a ring of objects
            # around the view centre all travel away from the camera.
            for obj in objects:
                center = obj.matrix_world.translation.copy()
                delta = _world_axis(context, self.axis, space, center) * distance
                matrix = obj.matrix_world.copy()
                matrix.translation += delta
                obj.matrix_world = matrix
        else:
            # Global, and Smart with a shared pivot, move the whole selection by
            # one delta. Global ignores the pivot, as it always has.
            center = (
                _pivot_point(context, objects, pivot_mode)
                if space == "SMART"
                else Vector()
            )
            delta = _world_axis(context, self.axis, space, center) * distance
            for obj in objects:
                matrix = obj.matrix_world.copy()
                matrix.translation += delta
                obj.matrix_world = matrix

        context.view_layer.update()
        _push_object_undo("My HID Step Translate")
        return {"FINISHED"}

    def _translate_view(self, context, distance):
        region_3d = context.space_data.region_3d
        if region_3d.view_perspective == "CAMERA":
            self.report({"WARNING"}, "My HID: leave camera view to pan the view")
            return {"CANCELLED"}

        current = region_3d.view_rotation.copy()
        if self.axis == "X":
            direction = current @ Vector((1.0, 0.0, 0.0))
        elif self.axis == "Y":
            direction = current @ Vector((0.0, 1.0, 0.0))
        else:
            direction = current @ Vector((0.0, 0.0, -1.0))

        region_3d.view_location = region_3d.view_location + direction * distance
        if context.area:
            context.area.tag_redraw()
        return {"FINISHED"}


class HID_OT_bind_default_keys(bpy.types.Operator):
    """(Re)create the default F13-F24 bindings in the 3D View keymap."""

    bl_idname = "hid.bind_default_keys"
    bl_label = "Rebind F13-F24"
    bl_description = "Bind the default My HID rotation and translation keys to this add-on"

    def execute(self, context):
        failures = _bind_default_keys()
        if failures:
            self.report({"WARNING"}, "My HID: " + "; ".join(failures))
            return {"CANCELLED"}
        self.report({"INFO"}, "My HID: bound F13-F24 in the 3D View keymap")
        return {"FINISHED"}


class HID_AP_preferences(bpy.types.AddonPreferences):
    bl_idname = ADDON_ID

    step_degrees: bpy.props.FloatProperty(
        name="Rotate step (degrees)",
        description="Degrees per My HID key tap",
        default=5.0,
        min=0.01,
        max=180.0,
        soft_max=45.0,
        precision=2,
    )
    step_distance: bpy.props.FloatProperty(
        name="Translate step",
        description="Distance per My HID key tap",
        default=0.1,
        min=0.0001,
        max=1000.0,
        soft_max=10.0,
        precision=3,
        subtype="DISTANCE",
    )
    target: bpy.props.EnumProperty(
        name="Apply to",
        description="What the My HID keys rotate or translate",
        items=(
            ("OBJECT", "Selected Objects", "Transform selected objects in Object Mode"),
            ("VIEW", "3D Viewport", "Orbit or pan the 3D viewport (not available in camera view)"),
        ),
        default="OBJECT",
    )
    space: bpy.props.EnumProperty(
        name="Axis Space",
        description="Axis space for selected-object rotation and translation",
        items=(
            ("GLOBAL", "Global", "Rotate and move along the global axes"),
            ("LOCAL", "Local", "Rotate and move along each object's local axes"),
            (
                "SMART",
                "Smart (Camera + World Z)",
                "X and Y lie in the XY plane and follow the camera: X points away "
                "from the camera and Y is 90 degrees from it. Z stays the world "
                "vertical, so it is still a turntable spin and a straight up/down move",
            ),
        ),
        default="GLOBAL",
    )
    pivot: bpy.props.EnumProperty(
        name="Pivot",
        description="Pivot for global selected-object rotation",
        items=(
            ("INDIVIDUAL", "Individual Origins", "Rotate each object around its own origin"),
            ("MEDIAN", "Median Point", "Rotate around the median of the selected objects"),
            ("CURSOR", "3D Cursor", "Rotate around the 3D cursor"),
        ),
        default="INDIVIDUAL",
    )
    auto_bind: bpy.props.BoolProperty(
        name="Auto-bind F13-F24",
        description="Create the default key bindings when the add-on is enabled",
        default=True,
    )

    def draw(self, context):
        layout = self.layout
        layout.prop(self, "target")
        layout.prop(self, "step_degrees")
        layout.prop(self, "step_distance")
        object_box = layout.column()
        object_box.enabled = self.target == "OBJECT"
        object_box.prop(self, "space")
        object_box.prop(self, "pivot")
        if self.space == "LOCAL":
            object_box.label(text="Local rotation uses each object's origin.", icon="INFO")
        elif self.space == "SMART":
            object_box.label(text="Smart: X/Y follow the camera, Z stays world up.", icon="INFO")
            object_box.label(text="Individual Origins gives each object its own ray.", icon="BLANK1")
        layout.separator()
        layout.prop(self, "auto_bind")
        layout.operator("hid.bind_default_keys", text="Rebind F13-F24", icon="KEYFRAME_HLT")


def _unbind_default_keys():
    for keymap, item in list(_KEYMAP_ITEMS):
        try:
            keymap.keymap_items.remove(item)
        except Exception:
            pass
    _KEYMAP_ITEMS.clear()


def _bind_default_keys():
    _unbind_default_keys()
    keyconfig = getattr(bpy.context.window_manager, "keyconfigs", None)
    keyconfig = getattr(keyconfig, "addon", None) if keyconfig else None
    if keyconfig is None:
        return ["no add-on key configuration is available"]

    keymap = keyconfig.keymaps.new(name="3D View", space_type="VIEW_3D")
    bindings = [
        ("hid.rotate_step", key, axis, direction)
        for key, axis, direction in _ROTATION_BINDINGS
    ] + [
        ("hid.translate_step", key, axis, direction)
        for key, axis, direction in _TRANSLATION_BINDINGS
    ]
    failures = []
    for operator, key, axis, direction in bindings:
        try:
            item = keymap.keymap_items.new(operator, key, "PRESS")
            item.properties.axis = axis
            item.properties.direction = direction
            item.active = True
            _KEYMAP_ITEMS.append((keymap, item))
        except Exception as exc:
            failures.append(f"{key}: {exc}")
    return failures


_CLASSES = (
    HID_OT_rotate_step,
    HID_OT_translate_step,
    HID_OT_bind_default_keys,
    HID_AP_preferences,
)


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)

    prefs = _prefs()
    if prefs is None or prefs.auto_bind:
        failures = _bind_default_keys()
        for failure in failures:
            print(f"My HID Step Controls: could not bind {failure}")


def unregister():
    _unbind_default_keys()
    for cls in reversed(_CLASSES):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
