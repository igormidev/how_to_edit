I'm Igor. You're my agent. We will be working together a lot, so I thought it would be worth introducing myself.

I am a senior flutter/dart developer with years of experience and published projects — that's my background.
But I want to start a career in youtube as a side project. The channel will mostly be about "anarcho-captalist".
In my videos, I plan to cover a wide range of topics from an anarcho-capitalist perspective, aiming to explain in simple terms how the free market can solve real-world problems more efficiently than government-run solutions.

I wanted to shared some of my editing preferences here so we can be more aligned as we work together.

# Editing style
The name of the channel is "Ancap Bulletin". A channel that advocates for anarcho-capitalism, aiming to explain the ideas of anarcho-capitalism and libertarianism in a simple and accessible way for everyday people, using practical examples and solid arguments to help them visualize what this model could look like in practice.
Our overall style is a paper/journal-like style.
This is a, mostly, "dark channel" in the sense that I will not appear on camera, and the focus will be on the content, visuals, and narration rather than my personal presence.

# Background
The background of most part of the videos will be a fixed crumbled paper texture background —  a warm off-white blank crumpled paper with subtle fibers and soft shallow crease shadows — giving a consistent and slightly vintage look that complements the paper/journal-like style of the channel. 
I have 2 variations of this background for the videos; one for horizontal, 1920×1080, 16:9, videos and one for vertical, 1080×1920, 9:16, videos (for tiktok, youtube shorts, instagram reals, etc.).
So, based on the orientation of the video, you should choose the appropriate background variation.
- Horizontal: [Horizontal Background video](assets/backgrounds/crumpled-paper-horizontal.mp4)
- Vertical: [Vertical Background video](assets/backgrounds/crumpled-paper-vertical.mp4)

As I said, this will be the background of the vast majority of the video — but sometimes I might ask you explicitly to use a different background or visual element to emphasize a particular point or segment in the video. In such cases, I will provide the necessary assets and instructions for you to follow.

# Images assets
Sometimes I will provide the assets for the scene that I am describing for you to do, but sometimes I won't and, in that case, you should analyse if you need to seek online for that image or create it yourself with the image generation tool you have built in.
All of those images in scenes will need to have a good intro transition, that will probably be one of the ones mentioned in "## Transitions"

# Transitions
When I introduce a new image or visual element in the video, I will usually specify the type of transition I want to use.
If I don't specify, you should choose an appropriate transition from the ones mentioned in this section.
I will describe each transition in detail, providing guidance on when and how to use them effectively in the videos.
Basically, these transitions are designed to make the introduction of new visual elements in the video more engaging and visually appealing.
There are some cenarios that I wan't to have mapped, they are:
- Should use "## Hand transition" when the image asset has a transparent background (like a person or an object image)
- Should use "## Crumbled paper ball transition" when the image that I will show has background and is not a cropped object

## Hand transition
This is better when we have a image that has a transparent background, I recommend using this transition in that situation.
For example: I am talking about a real person and that the image of that person that I will use in the video to illustrate the point has a transparent background, the hand transition would be appropriate to introduce that image smoothly.
Another example is a image of a object, that will probably have a transparent background,  and in that case, the hand transition would be suitable to introduce that object smoothly as well.

Now, I will demonstrate how to use the hand transition effectively in a video.
The asset of the hand is in the codebase and it has 2 variations, the hand "closed", that gives the impression of grabbing or holding something, and the hand "open", that gives the impression of releasing or presenting something.
First, let's talk about the assets for the hand transition.
The assets for the hand transition are as follows:
- [Open hand image](assets/transitions/hand_transitions/hand-open.png)
- [Closed hand image](assets/transitions/hand_transitions/hand-closed.png)
Note that each image has the same dimensions and resolution, ensuring consistency when using them in the hand transition.

In the animation, the hand can come from any direction — top, bottom, left, or right — depending on the desired effect and the composition of the scene.
The animation of the hand transition involves moving the hand image from its starting position (out of the scene) to the target position, creating the illusion of interaction with the scene.
Use the closed hand image initially, with the asset and the end of the hand — this creates the impression of grabbing or holding the object. Once the object is in the target position in the scene, switch to the open hand image to give the impression of releasing the image asset in the scene — then move the hand out of the scene from the same point in entered, retracing its path, to complete the transition.
Use easing functions to make the hand movement appear more natural and fluid. For example, you can use ease-in for the hand entering the scene and ease-out for the hand exiting the scene.
The switch from one to other should have no animation, it should be instantaneous to maintain the illusion of interaction — just change one image to the other. 

## Crumbled paper ball
This is the animation we will be using when we have an image that does not have a transparent background — unlike the hand transition, it is more suitable for images that are complete and not cropped objects.
The idea is: You'll use your image generation capacity to generate 5 versions of a intermediate frames between a totally crumpled paper ball and the open image asset that I want to show in the scene.
This animation will be like 2 seconds long, smoothly transitioning from the crumpled paper ball to the open image asset.
There will be 6 frames of image in this animation that will change one by one until the final result is in the scene.

The initial and last frames will be the same of the ball.
The first frame is of the ball totally crumpled, in this form it is not possible to see nothing of the image asset that will be revealed as the animation progresses.
The last frame will be the fully open image asset, the final result that will be visible in the scene.
Between it, I want 6 intermediate frames that gradually show the transition from the crumpled paper ball to the fully open image asset. Each frame should reveal a little more of the image asset (progressively less crumpled), creating a smooth and natural animation.
It is important to maintain consistent lighting and perspective across all frames to ensure the animation looks cohesive and realistic.
Try to visualize the crumpled paper ball gradually unfolding and revealing the image asset, frame by frame, until the final fully open image is displayed (the parts of the final image that appears in the crumbled version should gradually become visible).

About the first frame of the ball fully crubled, it is here: 
![Crumpled Paper Ball](how_to_edit/assets/transitions/crumbled_paper_ball/initial-frame-crumpled-paper-ball.png)

There is a visual reference that you can use as guide for creating the intermediate frames.
![Crumpled Paper Ball Reference](how_to_edit/assets/transitions/crumbled_paper_ball/crumbled-paper-animation-reference.png)
By the way, make sure to generate all frames with the same width, height and aspect ratio to ensure a consistent and smooth animation.

Make the changes consistent across all frames to maintain the illusion of a smooth unfolding animation.
Distribute the frames evenly over the 2-second animation to maintain a steady pace.

## Video "sticker intro" animation
When I wan't to add a video (or a gif) INSIDE a scene (that is; the video will not take the hole part of the scene — this is a video playing inside a specific area of the scene with another components).
Here is my idea: We will get the first frame of the video (or gif) and make a animation of that frame entering the scene like if it were a sticker being placed into the scene.
It comes from outside the scene and moves into the designated area (initially the image is inverted in the horizontal axis), and, when close to the place it will be placed, it starts to "stick" into the scene like a sticker (starting from the corner top left, and gradually adhering to the rest of the designated area — and fixing the orientation). After the last frame of that animation, you will change that first frame to the actual video (or gif) playing in the designated area (guarantee it is literally in the same area, review carefully to ensure proper alignment so the user does not now this change because, from his point of view, it will look like the video start playing seamlessly and not that we changed a image frame to a video).
The video should play in loop once it starts, unless I specify otherwise.

## Image/Video "unfolding" animation
This will not have a specific case of use like the previous animations, but it can be used creatively in various scenarios where you want to show an image or video gradually unfolding to reveal its content.
When I request this animation of "unfolding", I expect you to use this animation.
And, about the animation itself: the initial frame will be a totally folded paper, and it will come from outside the scene to the place where it will gradually unfold to reveal the full image or video content.
This animation can be used for image and video. In the case I am asking you to use it for video, you should get the first frame of the video with ffmpeg and use it as the initial frame for the unfolding animation — once the unfolding animation is complete, you will replace the initial frame with the actual video playing in the designated area, ensuring a seamless transition.
The video should play in loop once it starts, unless I specify otherwise.
There is a algoritm to do this in a deterministic way already ("unfolding" animation), so you can use it. But you will still need to do the part were the image comes from outside the scene and then you start to play the animation of it unfolding.

## Pieces of paper join animation
This will not have a specific case of use like the previous animations, but it can be used creatively in various scenarios where you want to show pieces of an image coming together to form a complete picture.
When I request this animation of "pieces of paper join", I expect you to use this animation.
And, about the animation itself: it should depict pieces of shredded paper coming together to form the image.
There is a algoritm to do this in a deterministic way already. Play that video animation in the designated area where the pieces of paper should come together to form the complete image and the last frame will be the image that you will continue to show in the scene.

# Hyperframes
We are using hyperframes to create the videos. There are endless skill files available for hyperframe — so make sure to check if any of them is usefull for the task you are working on (probably one or more skill will use usefull).
