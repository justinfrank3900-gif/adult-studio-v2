// lib/poses.ts
//
// THE STANDING LIST OF POSES, WRITTEN AS SENTENCES.
//
// "sitting" is not an instruction a generation model can follow. A sentence
// that says where the body is, where the weight is and where the camera is
// standing, is. Each of these is sent verbatim after the clothes and the
// room, and every one of them is editable before it goes out.
//
// They are grouped the way a shoot is actually planned - standing, sitting,
// lying, close - rather than alphabetically, because picking six poses for a
// set is choosing a spread rather than finding a name.

export type Pose = { key: string; label: string; line: string; group: Group };
export type Group = 'Standing' | 'Sitting' | 'Lying' | 'Close' | 'Moving';

export const POSES: Pose[] = [
  /* Standing */
  { key: 'stand_front', label: 'Standing, square on', group: 'Standing',
    line: 'Standing square to the camera, weight even, arms relaxed at her sides, head level, full length in frame.' },
  { key: 'stand_hip', label: 'Weight on one hip', group: 'Standing',
    line: 'Standing with her weight on one hip, the opposite shoulder dropped, one hand resting on her waist, full length in frame.' },
  { key: 'stand_back', label: 'Back to camera, looking over shoulder', group: 'Standing',
    line: 'Standing with her back to the camera, head turned to look back over one shoulder into the lens, full length in frame.' },
  { key: 'stand_wall', label: 'Leaning on the wall', group: 'Standing',
    line: 'Leaning her shoulder and hip against a wall, one knee bent, looking at the camera.' },
  { key: 'stand_arch', label: 'Arched, hands in hair', group: 'Standing',
    line: 'Standing with her back slightly arched, both hands lifted into her hair, chin raised, eyes on the lens.' },
  { key: 'stand_window', label: 'At the window, looking out', group: 'Standing',
    line: 'Standing at a window in profile looking out, light falling across her face and shoulder, not looking at the camera.' },

  /* Sitting */
  { key: 'sit_edge', label: 'Sitting on the edge', group: 'Sitting',
    line: 'Sitting on the edge of the bed with her knees together and her hands either side of her, leaning slightly forward, looking at the camera.' },
  { key: 'sit_crossed', label: 'Sitting, legs crossed', group: 'Sitting',
    line: 'Sitting with one leg crossed over the other, upper body turned a little away from the camera, looking back into the lens.' },
  { key: 'sit_kneel', label: 'Kneeling, upright', group: 'Sitting',
    line: 'Kneeling upright with her back straight and hands resting on her thighs, chin level, eyes on the camera.' },
  { key: 'sit_floor', label: 'On the floor, leaning back', group: 'Sitting',
    line: 'Sitting on the floor leaning back on both hands, legs extended and crossed at the ankle, head tilted back slightly.' },
  { key: 'sit_chair', label: 'In the chair, one leg over', group: 'Sitting',
    line: 'Sitting low in a chair with one leg draped over the arm, shoulders relaxed into the back of the chair, looking at the camera.' },

  /* Lying */
  { key: 'lie_front', label: 'On her front, propped up', group: 'Lying',
    line: 'Lying on her front propped up on both forearms, ankles crossed in the air behind her, looking straight at the camera.' },
  { key: 'lie_back', label: 'On her back, arms above', group: 'Lying',
    line: 'Lying on her back with both arms stretched above her head, one knee raised, shot from slightly above her.' },
  { key: 'lie_side', label: 'On her side', group: 'Lying',
    line: 'Lying on her side with her head propped on one hand, the other arm along her body, camera level with the bed.' },
  { key: 'lie_curl', label: 'Curled up', group: 'Lying',
    line: 'Curled on her side with her knees drawn up and both hands tucked under her cheek, eyes on the lens.' },

  /* Close */
  { key: 'close_face', label: 'Close on her face', group: 'Close',
    line: 'Close on her head and shoulders, filling the frame, soft light on one side of her face, looking straight down the lens.' },
  { key: 'close_overshoulder', label: 'Close, over the shoulder', group: 'Close',
    line: 'Close behind her shoulder with her face turned back towards the camera, the room soft behind her.' },
  { key: 'close_lowangle', label: 'Close from below', group: 'Close',
    line: 'Camera low and close, tilted up at her face and throat, chin lifted.' },
  { key: 'close_detail', label: 'Detail, waist and hands', group: 'Close',
    line: 'Close on her waist and hands only, her face out of frame, the fabric and the light doing the work.' },

  /* Moving */
  { key: 'move_walk', label: 'Walking towards the camera', group: 'Moving',
    line: 'Mid stride walking towards the camera, one foot off the ground, hair moving, looking straight ahead.' },
  { key: 'move_turn', label: 'Caught mid turn', group: 'Moving',
    line: 'Caught mid turn with her hair swinging across her shoulder, her face coming round towards the lens.' },
  { key: 'move_laugh', label: 'Laughing, not posed', group: 'Moving',
    line: 'Laughing with her head tipped back and her eyes closed, caught rather than posed.' },
];

export const GROUPS: Group[] = ['Standing', 'Sitting', 'Lying', 'Close', 'Moving'];

/** A sensible six to start from, spread across the groups rather than six
 *  variations on standing - which is what ticking down the list gives you. */
export const DEFAULT_SET = [
  'stand_front', 'stand_hip', 'sit_edge', 'lie_front', 'close_face', 'move_walk',
];
