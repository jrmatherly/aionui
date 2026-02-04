import ModalWrapper from '@/renderer/components/base/ModalWrapper';
import StepsWrapper from '@/renderer/components/base/StepsWrapper';
import { Button, Collapse, Message, Tag } from '@arco-design/web-react';
import { Check } from '@icon-park/react';
import React, { useState } from 'react';

const ComponentsShowcase: React.FC = () => {
  const [message, contextHolder] = Message.useMessage();
  const [modalVisible, setModalVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  return (
    <div className='p-8 space-y-8 max-w-6xl mx-auto'>
      {contextHolder}

      <div>
        <h1 className='text-3xl font-bold mb-2'>AionUi Custom Component Style Showcase</h1>
        <p className='text-t-secondary'>Showcasing all custom component styles in arco-override.css</p>
      </div>

      {/* Message */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Message - Notifications</h2>
        <div className='space-y-3'>
          <Button type='primary' status='success' onClick={() => message.success('Operation successful')} size='large'>
            Success Message
          </Button>
          <Button type='primary' status='warning' onClick={() => message.warning('Warning message')} size='large'>
            Warning Message
          </Button>
          <Button type='primary' onClick={() => message.info('Info message')} size='large'>
            Info Message
          </Button>
          <Button type='primary' status='danger' onClick={() => message.error('Error message')} size='large'>
            Error Message
          </Button>
          <Button
            onClick={() => {
              message.success('Operation successful');
              setTimeout(() => message.warning('Warning message'), 200);
              setTimeout(() => message.info('Info message'), 400);
              setTimeout(() => message.error('Error message'), 600);
            }}
            size='large'
          >
            Show All Types
          </Button>
        </div>
      </section>

      {/* Button */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Button - Buttons</h2>
        <div className='flex gap-3'>
          <Button type='outline'>Outline Button</Button>
          <Button type='primary'>Primary Button</Button>
          <Button>Default Button</Button>
          <Button type='primary' shape='round'>
            Round Button
          </Button>
        </div>
      </section>

      {/* Collapse */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Collapse - Collapsible Panel</h2>
        <Collapse defaultActiveKey={['1']}>
          <Collapse.Item header='Collapsible Panel Title 1' name='1'>
            <div>This is the content area of the collapsible panel, where any content can be placed.</div>
          </Collapse.Item>
          <Collapse.Item header='Collapsible Panel Title 2' name='2'>
            <div>Custom styles: no border, 8px rounded corners.</div>
          </Collapse.Item>
        </Collapse>
      </section>

      {/* Tag */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Tag - Tags (Dark Mode Optimized)</h2>
        <div className='flex gap-2 flex-wrap'>
          <Tag checkable color='blue'>
            Blue Tag
          </Tag>
          <Tag checkable color='green'>
            Green Tag
          </Tag>
          <Tag checkable color='red'>
            Red Tag
          </Tag>
          <Tag checkable color='orange'>
            Orange Tag
          </Tag>
          <Tag checkable color='gray'>
            Gray Tag
          </Tag>
        </div>
        <p className='text-sm text-t-secondary'>Tip: Switch to dark mode to see the optimized effect</p>
      </section>

      {/* Steps */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Steps - Step Bar</h2>
        <StepsWrapper current={currentStep} size='small'>
          <StepsWrapper.Step title='Step One' icon={currentStep > 1 ? <Check theme='filled' size={16} fill='#165dff' /> : undefined} />
          <StepsWrapper.Step title='Step Two' icon={currentStep > 2 ? <Check theme='filled' size={16} fill='#165dff' /> : undefined} />
          <StepsWrapper.Step title='Step Three' />
        </StepsWrapper>
        <div className='flex gap-2 mt-4'>
          <Button onClick={() => setCurrentStep(Math.max(1, currentStep - 1))} disabled={currentStep === 1}>
            Previous Step
          </Button>
          <Button onClick={() => setCurrentStep(Math.min(3, currentStep + 1))} disabled={currentStep === 3} type='primary'>
            Next Step
          </Button>
        </div>
      </section>

      {/* Modal */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Modal - Modal Dialog</h2>
        <Button type='primary' onClick={() => setModalVisible(true)}>
          Open Custom Modal
        </Button>
        <ModalWrapper
          title='Custom Modal Title'
          visible={modalVisible}
          onCancel={() => setModalVisible(false)}
          footer={
            <div className='flex justify-end gap-3'>
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
              <Button type='primary' onClick={() => setModalVisible(false)}>
                Confirm
              </Button>
            </div>
          }
        >
          <div className='p-6'>
            <p>这是使用 ModalWrapper 封装的自定义模态框。</p>
            <p className='mt-2 text-t-secondary'>特性：圆角 12px、自定义关闭按钮、主题背景色。</p>
          </div>
        </ModalWrapper>
      </section>
    </div>
  );
};

export default ComponentsShowcase;
