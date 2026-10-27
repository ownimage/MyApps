# Headless tests for the My HID Step Controls add-on.
#
# Run with Blender itself (bpy is only available inside Blender):
#
#   blender -b --python MyHID/blender/test_step_controls.py
#
# Exits with a non-zero status when any check fails, so it can be used as a
# check step. Nothing here touches the user's preferences: the add-on module is
# imported by path and its `_prefs()` is replaced with a stub, so the operators
# can be driven with an explicit Axis Space without enabling the add-on.

import importlib.util
import math
import os
import sys
import traceback

import bpy
from mathutils import Matrix, Quaternion, Vector

# Do not leave a __pycache__ next to the add-on when it is imported below.
sys.dont_write_bytecode = True

ADDON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hid_step_controls.py")

FAILURES = []
CHECKS = [0]


# --------------------------------------------------------------------------- #
# tiny assertion framework
# --------------------------------------------------------------------------- #


class CheckFailed(AssertionError):
    pass


def check(name, fn):
    CHECKS[0] += 1
    try:
        fn()
        print("PASS  " + name)
    except Exception:
        FAILURES.append((name, traceback.format_exc()))
        print("FAIL  " + name)


def expect(condition, message):
    if not condition:
        raise CheckFailed(message)


def expect_close(actual, expected, message, eps=1e-5):
    if abs(actual - expected) > eps:
        raise CheckFailed("%s (expected %r, got %r)" % (message, expected, actual))


def expect_vector(actual, expected, message, eps=1e-5):
    wanted = Vector(expected)
    got = Vector(actual)
    if (got - wanted).length > eps:
        raise CheckFailed(
            "%s (expected (%0.6f, %0.6f, %0.6f), got (%0.6f, %0.6f, %0.6f))"
            % (message, wanted.x, wanted.y, wanted.z, got.x, got.y, got.z)
        )


def expect_equiv(actual, expected, message, eps=1e-5):
    """Compare rotation-ish values that are only equal up to sign/wrap."""
    if abs(actual - expected) > eps:
        raise CheckFailed("%s (expected %r, got %r)" % (message, expected, actual))


# --------------------------------------------------------------------------- #
# add-on loading + preference stub
# --------------------------------------------------------------------------- #


def load_addon():
    spec = importlib.util.spec_from_file_location("hid_step_controls_under_test", ADDON_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ADDON = load_addon()


class StubPrefs:
    target = "OBJECT"
    space = "SMART"
    pivot = "INDIVIDUAL"
    step_degrees = 5.0
    step_distance = 0.1
    auto_bind = False


PREFS = StubPrefs()
ADDON._prefs = lambda: PREFS


# --------------------------------------------------------------------------- #
# scene helpers
# --------------------------------------------------------------------------- #


def reset_prefs(space="SMART", pivot="INDIVIDUAL", target="OBJECT"):
    PREFS.space = space
    PREFS.pivot = pivot
    PREFS.target = target
    PREFS.step_degrees = 5.0
    PREFS.step_distance = 0.1


def reset_scene():
    # Empty the scene by hand: read_factory_settings reloads add-ons mid-test and
    # prints addon_utils tracebacks that are not ours.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.scene.camera = None
    bpy.context.view_layer.objects.active = None


def look_at(obj, target):
    direction = Vector(target) - obj.location
    if direction.length < 1e-9:
        direction = Vector((0.0, 0.0, -1.0))
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_camera(location, target=(0.0, 0.0, 0.0)):
    data = bpy.data.cameras.new("TestCam")
    camera = bpy.data.objects.new("TestCam", data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = Vector(location)
    look_at(camera, target)
    bpy.context.scene.camera = camera
    # matrix_world is cached: without an update a fresh camera still reports the
    # identity transform, which would make every Smart test fall back.
    bpy.context.view_layer.update()
    return camera


def add_empty(name, location=(0.0, 0.0, 0.0), rotation=(0.0, 0.0, 0.0)):
    mesh = bpy.data.meshes.new(name + "Mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = Vector(location)
    obj.rotation_euler = rotation
    return obj


def select_only(*objects):
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0] if objects else None


def build_board(camera_location, cube_locations):
    """Fresh scene with a camera aimed at the origin plus one object per location."""
    reset_scene()
    camera = add_camera(camera_location)
    cubes = [add_empty("Cube%d" % index, location) for index, location in enumerate(cube_locations)]
    select_only(*cubes)
    bpy.context.view_layer.update()
    return camera, cubes


def operator_axis(name, axis, direction=1):
    """Run one Hid tap through the registered operator."""
    result = getattr(bpy.ops.hid, name)(axis=axis, direction=direction)
    expect(result == {"FINISHED"}, "operator %s did not finish (%r)" % (name, result))


# --------------------------------------------------------------------------- #
# stub context for the viewport branch (no real area exists in background mode)
# --------------------------------------------------------------------------- #


class StubRegion3D:
    def __init__(self, perspective="PERSP", eye=(0.0, 0.0, 0.0), rotation=None):
        self.view_perspective = perspective
        rotation = Quaternion() if rotation is None else rotation
        self.view_rotation = rotation
        world = Matrix.Translation(Vector(eye)) @ rotation.to_matrix().to_4x4()
        self.view_matrix = world.inverted()
        self.view_location = Vector((0.0, 0.0, 0.0))
        self.view_distance = 10.0


class StubSpaceData:
    type = "VIEW_3D"

    def __init__(self, region):
        self.region_3d = region


class StubContext:
    def __init__(self, region):
        self.space_data = StubSpaceData(region)
        self.scene = bpy.context.scene


# --------------------------------------------------------------------------- #
# tests: the Smart basis
# --------------------------------------------------------------------------- #


def smart_basis(center=(0.0, 0.0, 0.0)):
    return ADDON._smart_basis(bpy.context, Vector(center))


def test_smart_basis_follows_camera():
    build_board((0.0, -10.0, 10.0), [(0.0, 0.0, 0.0)])
    x_axis, y_axis, z_axis = smart_basis()
    expect_vector(z_axis, (0.0, 0.0, 1.0), "Smart Z must be world up")
    expect_vector(x_axis, (0.0, 1.0, 0.0), "Smart X must be the horizontal camera-to-object direction")
    expect_vector(y_axis, (1.0, 0.0, 0.0), "Smart Y must be 90 degrees from X in the XY plane")


def test_smart_basis_is_orthonormal_and_flat():
    for elevation in (5.0, 30.0, 45.0, 70.0, 88.0, -35.0):
        radians = math.radians(elevation)
        distance = 10.0
        camera_location = (
            0.0,
            -distance * math.cos(radians),
            distance * math.sin(radians),
        )
        build_board(camera_location, [(0.0, 0.0, 0.0)])
        x_axis, y_axis, z_axis = smart_basis()
        expect_close(x_axis.length, 1.0, "Smart X must be unit length at %s deg" % elevation)
        expect_close(y_axis.length, 1.0, "Smart Y must be unit length at %s deg" % elevation)
        expect_close(x_axis.dot(y_axis), 0.0, "Smart X and Y must be perpendicular at %s deg" % elevation)
        expect_close(x_axis.z, 0.0, "Smart X must stay in the XY plane at %s deg" % elevation)
        expect_close(y_axis.z, 0.0, "Smart Y must stay in the XY plane at %s deg" % elevation)
        expect_vector(z_axis, (0.0, 0.0, 1.0), "Smart Z must stay world up at %s deg" % elevation)


def test_smart_basis_offcentre_object_uses_its_own_ray():
    build_board((0.0, -10.0, 0.0), [(5.0, -5.0, 0.0)])
    x_axis, _, _ = smart_basis((5.0, -5.0, 0.0))
    expect_vector(x_axis, (0.5 * math.sqrt(2.0), 0.5 * math.sqrt(2.0), 0.0), "Smart X must follow the ray to THIS object")


def test_smart_top_down_falls_back_without_crashing():
    build_board((0.0, 0.0, 10.0), [(0.0, 0.0, 0.0)])
    x_axis, y_axis, z_axis = smart_basis()
    expect_close(x_axis.length, 1.0, "top-down fallback X must be unit length")
    expect_close(y_axis.length, 1.0, "top-down fallback Y must be unit length")
    expect_close(x_axis.z, 0.0, "top-down fallback X must stay in the XY plane")
    expect_close(y_axis.z, 0.0, "top-down fallback Y must stay in the XY plane")
    expect_close(x_axis.dot(y_axis), 0.0, "top-down fallback axes must be perpendicular")
    expect_vector(z_axis, (0.0, 0.0, 1.0), "top-down fallback Z must stay world up")


def test_smart_top_down_uses_viewport_right_when_a_view_exists():
    region = StubRegion3D(perspective="PERSP", eye=(0.0, 0.0, 10.0))
    camera = add_camera((0.0, -10.0, 0.0))
    bpy.context.scene.camera = camera
    x_axis, y_axis, _ = ADDON._smart_basis(StubContext(region), Vector((0.0, 0.0, 0.0)))
    expect_vector(x_axis, (1.0, 0.0, 0.0), "a top-down view must fall back to the viewport right axis")
    expect_vector(y_axis, (0.0, -1.0, 0.0), "the fallback Y must still be 90 degrees in the XY plane")


def test_smart_prefers_the_scene_camera_in_camera_view():
    camera = add_camera((10.0, 0.0, 0.0))
    region = StubRegion3D(perspective="CAMERA", eye=(0.0, -10.0, 0.0))
    x_axis, _, _ = ADDON._smart_basis(StubContext(region), Vector((0.0, 0.0, 0.0)))
    expect_vector(x_axis, (-1.0, 0.0, 0.0), "camera view must use the scene camera, not the viewport orbit")


def test_smart_uses_the_viewport_outside_camera_view():
    camera = add_camera((10.0, 0.0, 0.0))
    region = StubRegion3D(perspective="PERSP", eye=(0.0, -10.0, 0.0))
    x_axis, _, _ = ADDON._smart_basis(StubContext(region), Vector((0.0, 0.0, 0.0)))
    expect_vector(x_axis, (0.0, 1.0, 0.0), "a normal viewport must use its own viewing direction")


# --------------------------------------------------------------------------- #
# tests: operator behaviour under Smart
# --------------------------------------------------------------------------- #


def test_smart_rotate_z_stays_world_z():
    _, cubes = build_board((0.0, -10.0, 5.0), [(0.0, 0.0, 0.0)])
    cube = cubes[0]
    reset_prefs(space="SMART", pivot="INDIVIDUAL")
    operator_axis("rotate_step", "Z", 1)
    expect_close(cube.rotation_euler.x, 0.0, "Smart Z rotation must not touch X rotation")
    expect_close(cube.rotation_euler.y, 0.0, "Smart Z rotation must not touch Y rotation")
    expect_close(cube.rotation_euler.z, math.radians(5.0), "Smart Z rotation must spin about world Z")
    expect_vector(cube.location, (0.0, 0.0, 0.0), "Smart Z rotation must keep the origin in place")


def test_smart_rotate_y_pitches_about_the_camera_plane_axis():
    _, cubes = build_board((0.0, -10.0, 10.0), [(0.0, 0.0, 0.0)])
    cube = cubes[0]
    reset_prefs(space="SMART", pivot="INDIVIDUAL")
    operator_axis("rotate_step", "Y", 1)
    expect_close(cube.rotation_euler.x, math.radians(5.0), "Smart Y rotation must pitch about the world X axis here")
    expect_close(cube.rotation_euler.y, 0.0, "Smart Y rotation must leave Y rotation alone")
    expect_close(cube.rotation_euler.z, 0.0, "Smart Y rotation must leave Z rotation alone")


def test_smart_translate_x_moves_away_from_the_camera():
    _, cubes = build_board((0.0, -10.0, 0.0), [(0.0, 0.0, 0.0)])
    cube = cubes[0]
    reset_prefs(space="SMART", pivot="INDIVIDUAL")
    operator_axis("translate_step", "X", 1)
    expect_vector(cube.location, (0.0, 0.1, 0.0), "Smart X+ must push the object away from the camera")

    operator_axis("translate_step", "X", -1)
    expect_vector(cube.location, (0.0, 0.0, 0.0), "Smart X- must bring it back")


def test_smart_translate_z_is_world_up():
    _, cubes = build_board((0.0, -10.0, 10.0), [(0.0, 0.0, 0.0)])
    cube = cubes[0]
    reset_prefs(space="SMART", pivot="INDIVIDUAL")
    operator_axis("translate_step", "Z", 1)
    expect_vector(cube.location, (0.0, 0.0, 0.1), "Smart Z+ must move straight up in world space")


def test_smart_translate_follows_a_rotated_camera():
    # Camera to the right, so Smart X points along -X in world space.
    _, cubes = build_board((10.0, 0.0, 0.0), [(0.0, 0.0, 0.0)])
    cube = cubes[0]
    reset_prefs(space="SMART", pivot="INDIVIDUAL")
    operator_axis("translate_step", "X", 1)
    expect_vector(cube.location, (-0.1, 0.0, 0.0), "Smart X+ must point away from a camera on +X")


def test_smart_individual_gives_each_object_its_own_ray():
    _, cubes = build_board((0.0, -10.0, 0.0), [(0.0, 0.0, 0.0), (5.0, -5.0, 0.0)])
    reset_prefs(space="SMART", pivot="INDIVIDUAL")
    select_only(*cubes)
    operator_axis("translate_step", "X", 1)

    expect_vector(cubes[0].location, (0.0, 0.1, 0.0), "the object on the camera axis must move along world +Y")
    diagonal = 0.1 * (0.5 * math.sqrt(2.0))
    expect_vector(
        cubes[1].location,
        (5.0 + diagonal, -5.0 + diagonal, 0.0),
        "the off-axis object must move along ITS OWN ray",
    )


def test_smart_median_shares_one_basis():
    _, cubes = build_board((0.0, -10.0, 0.0), [(0.0, 0.0, 0.0), (5.0, -5.0, 0.0)])
    reset_prefs(space="SMART", pivot="MEDIAN")
    select_only(*cubes)
    operator_axis("translate_step", "X", 1)

    first = Vector(cubes[0].location) - Vector((0.0, 0.0, 0.0))
    second = Vector(cubes[1].location) - Vector((5.0, -5.0, 0.0))
    expect_vector(first, second, "Median Point must move every object by the same delta")
    expect_vector(first, smart_basis((2.5, -2.5, 0.0))[0] * 0.1, "the shared delta must follow the median ray")


def test_smart_rotation_respects_the_pivot():
    _, cubes = build_board((0.0, -10.0, 0.0), [(-1.0, 0.0, 0.0), (1.0, 0.0, 0.0)])
    reset_prefs(space="SMART", pivot="MEDIAN")
    select_only(*cubes)
    operator_axis("rotate_step", "Z", 1)

    # A 5 degree turn about world Z around the (0, 0, 0) median moves the pair.
    radius = 1.0
    angle = math.radians(5.0)
    expected_x = -radius * math.cos(angle)
    expected_y = -radius * math.sin(angle)
    expect_vector(cubes[0].location, (expected_x, expected_y, 0.0), "Smart rotation must orbit the median pivot")
    expect_vector(cubes[1].location, (-expected_x, -expected_y, 0.0), "both members must orbit the median pivot")


# --------------------------------------------------------------------------- #
# tests: Global and Local must be unchanged
# --------------------------------------------------------------------------- #


def test_global_translate_is_world_axes():
    _, cubes = build_board((0.0, -10.0, 10.0), [(0.0, 0.0, 0.0)])
    cube = cubes[0]
    reset_prefs(space="GLOBAL")
    operator_axis("translate_step", "X", 1)
    operator_axis("translate_step", "Y", 1)
    operator_axis("translate_step", "Z", 1)
    expect_vector(cube.location, (0.1, 0.1, 0.1), "Global translation must stay on the world axes")


def test_global_rotate_is_world_axis():
    _, cubes = build_board((0.0, -10.0, 10.0), [(0.0, 0.0, 0.0)])
    cube = cubes[0]
    reset_prefs(space="GLOBAL")
    operator_axis("rotate_step", "X", 1)
    expect_close(cube.rotation_euler.x, math.radians(5.0), "Global X rotation must be about world X")


def test_local_translate_uses_object_axes():
    _, cubes = build_board((0.0, -10.0, 10.0), [(0.0, 0.0, 0.0)])
    cube = cubes[0]
    cube.rotation_euler = (0.0, 0.0, math.radians(90.0))
    reset_prefs(space="LOCAL")
    operator_axis("translate_step", "X", 1)
    expect_vector(cube.location, (0.0, 0.1, 0.0), "Local X+ on a 90 degree turned object must move along world +Y")


def test_local_rotate_uses_object_axes():
    _, cubes = build_board((0.0, -10.0, 10.0), [(0.0, 0.0, 0.0)])
    cube = cubes[0]
    cube.rotation_euler = (0.0, 0.0, math.radians(90.0))
    reset_prefs(space="LOCAL")
    operator_axis("rotate_step", "X", 1)
    # The LOCAL path right-multiplies a WORLD-axis rotation, so the extra turn is
    # the object's own X (Euler XYZ composes as Rz @ Ry @ Rx).
    expect_close(cube.rotation_euler.x, math.radians(5.0), "Local X rotation must add to the object's own X")
    expect_close(cube.rotation_euler.y, 0.0, "Local X rotation must not add a world Y turn")
    expect_close(cube.rotation_euler.z, math.radians(90.0), "Local rotation must not change the existing turn")


def test_viewport_target_ignores_the_axis_space():
    """Smart must not change the 3D Viewport behaviour (it has no region here)."""
    build_board((0.0, -10.0, 10.0), [(0.0, 0.0, 0.0)])
    reset_prefs(space="SMART", target="VIEW")
    # Without a 3D View area the operator's poll must refuse rather than crash.
    expect(
        ADDON.HID_OT_rotate_step.poll(bpy.context) is False,
        "the viewport target must not poll without a 3D View",
    )
    expect(
        ADDON.HID_OT_translate_step.poll(bpy.context) is False,
        "the viewport translate target must not poll without a 3D View",
    )
    failed = False
    try:
        bpy.ops.hid.rotate_step(axis="X", direction=1)
    except RuntimeError:
        failed = True
    expect(failed, "calling the viewport operator without a 3D View must raise")


# --------------------------------------------------------------------------- #
# test: preferences expose the Smart choice
# --------------------------------------------------------------------------- #


def test_preferences_offer_smart_space():
    # AddonPreferences cannot be registered outside a real add-on module, so read
    # the deferred property definition the class body declares.
    deferred = ADDON.HID_AP_preferences.__annotations__.get("space")
    expect(deferred is not None, "the Axis Space property definition is missing")
    items = deferred.keywords.get("items")
    expect(bool(items), "the Axis Space property declares no items")
    keys = [item[0] for item in items]
    expect("GLOBAL" in keys and "LOCAL" in keys, "Global and Local must stay available (%r)" % (keys,))
    expect("SMART" in keys, "Axis Space must offer SMART (found %r)" % (keys,))
    descriptions = {item[0]: item[2] for item in items}
    expect(descriptions["SMART"].strip() != "", "the Smart choice needs a description")
    labels = {item[0]: item[1] for item in items}
    expect("Smart" in labels["SMART"], "the Smart choice needs a readable label (%r)" % (labels["SMART"],))
    expect(deferred.keywords.get("default") == "GLOBAL", "the default axis space must stay Global")


# --------------------------------------------------------------------------- #
# runner
# --------------------------------------------------------------------------- #

CHECKS_LIST = (
    ("smart basis follows the camera", test_smart_basis_follows_camera),
    ("smart basis stays orthonormal and flat", test_smart_basis_is_orthonormal_and_flat),
    ("smart basis uses the object's own ray", test_smart_basis_offcentre_object_uses_its_own_ray),
    ("smart top-down falls back", test_smart_top_down_falls_back_without_crashing),
    ("smart top-down uses the viewport right axis", test_smart_top_down_uses_viewport_right_when_a_view_exists),
    ("smart prefers the scene camera in camera view", test_smart_prefers_the_scene_camera_in_camera_view),
    ("smart uses the viewport outside camera view", test_smart_uses_the_viewport_outside_camera_view),
    ("smart rotate Z is world Z", test_smart_rotate_z_stays_world_z),
    ("smart rotate Y pitches", test_smart_rotate_y_pitches_about_the_camera_plane_axis),
    ("smart translate X moves away from the camera", test_smart_translate_x_moves_away_from_the_camera),
    ("smart translate Z is world up", test_smart_translate_z_is_world_up),
    ("smart translate follows a turned camera", test_smart_translate_follows_a_rotated_camera),
    ("smart individual uses each object's ray", test_smart_individual_gives_each_object_its_own_ray),
    ("smart median shares one basis", test_smart_median_shares_one_basis),
    ("smart rotation respects the pivot", test_smart_rotation_respects_the_pivot),
    ("global translate stays on world axes", test_global_translate_is_world_axes),
    ("global rotate stays on the world axis", test_global_rotate_is_world_axis),
    ("local translate uses object axes", test_local_translate_uses_object_axes),
    ("local rotate uses object axes", test_local_rotate_uses_object_axes),
    ("viewport target ignores the axis space", test_viewport_target_ignores_the_axis_space),
    ("preferences offer Smart space", test_preferences_offer_smart_space),
)


def main():
    print("Blender %s" % bpy.app.version_string)
    bpy.utils.register_class(ADDON.HID_OT_rotate_step)
    bpy.utils.register_class(ADDON.HID_OT_translate_step)
    try:
        for name, fn in CHECKS_LIST:
            check(name, fn)
    finally:
        bpy.utils.unregister_class(ADDON.HID_OT_translate_step)
        bpy.utils.unregister_class(ADDON.HID_OT_rotate_step)

    print("")
    print("%d checks, %d failed" % (CHECKS[0], len(FAILURES)))
    for name, detail in FAILURES:
        print("")
        print("FAILED: " + name)
        print(detail.rstrip())
    sys.exit(1 if FAILURES else 0)


main()
