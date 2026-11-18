import React from 'react';
import {Composition} from 'remotion';
import {PontiasAd, DURATION, FPS} from './PontiasAd';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="PontiasNotification"
    component={PontiasAd}
    durationInFrames={DURATION}
    fps={FPS}
    width={1080}
    height={1920}
  />
);
