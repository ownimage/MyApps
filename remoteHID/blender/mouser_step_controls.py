# Mouser Step Controls — Blender 4.4 add-on
#
# Blender's keymap UI often refuses to capture F13–F24, even though Blender's
# event system knows about them. This add-on registers the operators from Python
# and binds F13–F24 to fixed-step rotations and translations. Mouser sends one
# key tap per ratchet step, so each tap moves by exactly one step.
#
# Install: Edit -> Preferences -> Add-ons -> Install from Disk, then enable
# "Mouser Step Controls". The F13–F24 bindings are added to the 3D View keymap.
#
# Two targets:
#   Selected Objects - rotate/translate selected objects in object mode.
#   3D Viewport       - orbit/pan the view (not available in camera view).
#
# The default mapping matches Mouser's rx/ry/rz + tx/ty/tz defaults:
#   F13/F14 = rotate X +/-
#   F15/F16 = rotate Y +/-
#   F17/F18 = rotate Z +/-
#   F19/F20 = translate X +/-
#   F21/F22 = translate Y +/-
#   F23/F24 = translate Z +/-

bl_info = {
    "name": "Mouser Step Controls",
    "author": "MyApps",
    "version": (1, 1, 0),
    "blender": (4, 4, 0),
    "location": "3D Viewport keymap (F13-F24)",
    "description": "Rotate or translate selected objects or the 3D view by fixed steps from Mouser key taps",
    "category": "3D View",
}

import math

import bpy
from mathutils import Matrix, Quaternion, Vector

ADDON_ID = __name__ if __name__ != "__main__" else "mouser_step_controls"

_AXIS_ITEMS = (
    ("X", "X", "X axis"),
    ("Y", "Y", "Y axis"),
    ("Z", "Z", "Z axis"),
)

# (key, axis, direction) for the default Mouser F13–F18 rotation layout.
_ROTATION_BINDINGS = (
    ("F13", "X", 1),
    ("F14", "X", -1),
    ("F15", "Y", 1),
    ("F16", "Y", -1),
    ("F17", "Z", 1),
    ("F18", "Z", -1),
)

# (key, axis, direction) for the default Mouser F19–F24 translation layout.
_TRANSLATION_BINDINGS = (
    ("F19", "X", 1),
    ("F20", "X", -1),
    ("F21", "Y", 1),
    ("F22", "Y", -1),
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


class MOUSER_OT_rotate_step(bpy.types.Operator):
    """Rotate selected objects or the 3D view by one fixed angular step."""

    bl_idname = "mouser.rotate_step"
    bl_label = "Mouser Step Rotate"
    bl_description = "Rotate by the configured step; bind a Mouser key to this operator"
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
            self.report({"WARNING"}, "Mouser: select at least one object")
            return {"CANCELLED"}

        prefs = _prefs()
        space = getattr(prefs, "space", "GLOBAL")
        pivot_mode = getattr(prefs, "pivot", "INDIVIDUAL")
        axis = Vector((1.0, 0.0, 0.0)) if self.axis == "X" else (
            Vector((0.0, 1.0, 0.0)) if self.axis == "Y" else Vector((0.0, 0.0, 1.0))
        )
        rotation = Matrix.Rotation(angle, 4, axis)

        if space == "LOCAL":
            # Local rotation is always around each object's own origin. The
            # pivot preference only applies to global rotations.
            for obj in objects:
                obj.matrix_world = obj.matrix_world @ rotation
        elif pivot_mode == "INDIVIDUAL":
            for obj in objects:
                location = obj.matrix_world.translation.copy()
                around_object = (
                    Matrix.Translation(location)
                    @ rotation
                    @ Matrix.Translation(-location)
                )
                obj.matrix_world = around_object @ obj.matrix_world
        else:
            if pivot_mode == "CURSOR":
                pivot = context.scene.cursor.location.copy()
            else:
                pivot = sum(
                    (obj.matrix_world.translation for obj in objects),
                    Vector((0.0, 0.0, 0.0)),
                ) / len(objects)
            around_pivot = (
                Matrix.Translation(pivot)
                @ rotation
                @ Matrix.Translation(-pivot)
            )
            for obj in objects:
                obj.matrix_world = around_pivot @ obj.matrix_world

        context.view_layer.update()
        _push_object_undo("Mouser Step Rotate")
        return {"FINISHED"}

    def _rotate_view(self, context, angle):
        region_3d = context.space_data.region_3d
        if region_3d.view_perspective == "CAMERA":
            self.report({"WARNING"}, "Mouser: leave camera view to orbit the view")
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


class MOUSER_OT_translate_step(bpy.types.Operator):
    """Translate selected objects or the 3D view by one fixed distance step."""

    bl_idname = "mouser.translate_step"
    bl_label = "Mouser Step Translate"
    bl_description = "Move by the configured distance; bind a Mouser key to this operator"
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
            self.report({"WARNING"}, "Mouser: select at least one object")
            return {"CANCELLED"}

        prefs = _prefs()
        space = getattr(prefs, "space", "GLOBAL")
        axis = Vector((1.0, 0.0, 0.0)) if self.axis == "X" else (
            Vector((0.0, 1.0, 0.0)) if self.axis == "Y" else Vector((0.0, 0.0, 1.0))
        )
        delta = axis * distance

        if space == "LOCAL":
            local_delta = Matrix.Translation(delta)
            for obj in objects:
                obj.matrix_world = obj.matrix_world @ local_delta
        else:
            for obj in objects:
                matrix = obj.matrix_world.copy()
                matrix.translation += delta
                obj.matrix_world = matrix

        context.view_layer.update()
        _push_object_undo("Mouser Step Translate")
        return {"FINISHED"}

    def _translate_view(self, context, distance):
        region_3d = context.space_data.region_3d
        if region_3d.view_perspective == "CAMERA":
            self.report({"WARNING"}, "Mouser: leave camera view to pan the view")
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


class MOUSER_OT_bind_default_keys(bpy.types.Operator):
    """(Re)create the default F13-F24 bindings in the 3D View keymap."""

    bl_idname = "mouser.bind_default_keys"
    bl_label = "Rebind F13-F24"
    bl_description = "Bind the default Mouser rotation and translation keys to this add-on"

    def execute(self, context):
        failures = _bind_default_keys()
        if failures:
            self.report({"WARNING"}, "Mouser: " + "; ".join(failures))
            return {"CANCELLED"}
        self.report({"INFO"}, "Mouser: bound F13-F24 in the 3D View keymap")
        return {"FINISHED"}


class MOUSER_AP_preferences(bpy.types.AddonPreferences):
    bl_idname = ADDON_ID

    step_degrees: bpy.props.FloatProperty(
        name="Rotate step (degrees)",
        description="Degrees per Mouser key tap",
        default=5.0,
        min=0.01,
        max=180.0,
        soft_max=45.0,
        precision=2,
    )
    step_distance: bpy.props.FloatProperty(
        name="Translate step",
        description="Distance per Mouser key tap",
        default=0.1,
        min=0.0001,
        max=1000.0,
        soft_max=10.0,
        precision=3,
        subtype="DISTANCE",
    )
    target: bpy.props.EnumProperty(
        name="Apply to",
        description="What the Mouser keys rotate or translate",
        items=(
            ("OBJECT", "Selected Objects", "Transform selected objects in Object Mode"),
            ("VIEW", "3D Viewport", "Orbit or pan the 3D viewport (not available in camera view)"),
        ),
        default="OBJECT",
    )
    space: bpy.props.EnumProperty(
        name="Axis Space",
        description="Axis space for selected-object rotation",
        items=(
            ("GLOBAL", "Global", "Rotate around the global axis"),
            ("LOCAL", "Local", "Rotate around each object's local axis"),
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
        layout.separator()
        layout.prop(self, "auto_bind")
        layout.operator("mouser.bind_default_keys", text="Rebind F13-F24", icon="KEYFRAME_HLT")


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
        ("mouser.rotate_step", key, axis, direction)
        for key, axis, direction in _ROTATION_BINDINGS
    ] + [
        ("mouser.translate_step", key, axis, direction)
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
    MOUSER_OT_rotate_step,
    MOUSER_OT_translate_step,
    MOUSER_OT_bind_default_keys,
    MOUSER_AP_preferences,
)


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)

    prefs = _prefs()
    if prefs is None or prefs.auto_bind:
        failures = _bind_default_keys()
        for failure in failures:
            print(f"Mouser Step Controls: could not bind {failure}")


def unregister():
    _unbind_default_keys()
    for cls in reversed(_CLASSES):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
