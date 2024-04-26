import { 
    runtimeModule,
    state, 
    runtimeMethod, 
    RuntimeModule 
} from "@proto-kit/module";
import { State, StateMap, assert } from "@proto-kit/protocol";
import { Field, PublicKey, Struct, Provable, Bool } from "o1js";

export const LOWER_LIMIT = Field(100000000000);
export const UPPER_LIMIT = Field(999999999999);
export const INITIAL_MESSAGE_NUMBER = Field(0);

export const ERRORS = {
    spyNotRecruited: "Spy not recruited yet, no spy with that id has been initialized",
    codeMismatch: "Security code does not match",
    messageTooShort: "Message is less than 12 characters long",
    messageTooLong: "Message is more than 12 characters long",
    messageNumber: "Message number is not greater than the last message number",
    onlyOneSpyMaster: "There can be only one master",
    thereMustBeASpyMaster: "There must be a spy master to recruit spies",
    onlySpyMasterCanRecruit: "Only the spy master can recruit spies"
  };

// this is the incoming messages
export class SpyMessage extends Struct({
    agentId: Field, 
    messageNumber: Field,
    twelveCharacters: Field, 
    securityCode: Field,
    }) {}

// this is what is stored in the state
export class SpyInfo extends Struct({
    lastMessageNumber: Field,
    securityCode: Field,
    }) {}

@runtimeModule()
export class Messages extends RuntimeModule<unknown> {
    // stored on-chain L2 states 
    @state() public spyDetails  = StateMap.from<Field, SpyInfo>(
        Field, 
        SpyInfo
    );

   // address of the dude that recruits spies, and sets spy secrets
   @state() public spyMaster = State.from<PublicKey>(PublicKey);

   // make a spy master, and only change it if its blank
   @runtimeMethod()
   public setSpyMaster(): void {
       const sender = this.transaction.sender.value;
       const currentSpyMaster = this.spyMaster.get();
       assert(currentSpyMaster.isSome.not(), ERRORS.onlyOneSpyMaster);
       this.spyMaster.set(sender);
   }    

    @runtimeMethod()
    public recruitSpy(
        agentId: Field, 
        securityCode: Field
    ): void {
        const sender = this.transaction.sender.value;
        const curSpyMaster = this.spyMaster.get();
        assert(curSpyMaster.isSome, ERRORS.thereMustBeASpyMaster);
        assert(curSpyMaster.value.equals(sender), ERRORS.onlySpyMasterCanRecruit);

        const spyInfo = new SpyInfo({ lastMessageNumber: INITIAL_MESSAGE_NUMBER, securityCode });
        this.spyDetails.set(agentId, spyInfo);
    }

    @runtimeMethod()
    public receiveMessage(
        incomingMessage: SpyMessage
    ){
        // STEP 1: make sure agentId exists in the system 
        const incomingAgentId = incomingMessage.agentId;
        assert(this.spyDetails.get(incomingAgentId).isSome, ERRORS.spyNotRecruited);

        const storedSpyDetails = this.spyDetails.get(incomingAgentId).value;

        // STEP 2 make sure that the security code matches the one stored in the state
        const storedSecurity = storedSpyDetails.securityCode;
        const incomingSecurity  = incomingMessage.securityCode;
        assert(storedSecurity.equals(incomingSecurity), ERRORS.codeMismatch);

        // STEP 3 make sure that the message is of the correct length 
        assert(incomingMessage.twelveCharacters.greaterThanOrEqual(LOWER_LIMIT), ERRORS.messageTooShort);
        assert(incomingMessage.twelveCharacters.lessThanOrEqual(UPPER_LIMIT), ERRORS.messageTooLong);

        // STEP 4 make sure that the message number is greater than the last message number
        const incomingMessageNumber = incomingMessage.messageNumber;
        const lastMessageNumber = storedSpyDetails.lastMessageNumber;
        assert(incomingMessageNumber.greaterThan(lastMessageNumber), ERRORS.messageNumber);

        // STEP 5 update the last message number in the state
        storedSpyDetails.lastMessageNumber = incomingMessageNumber;

        // STEP 6 update the StateMap
        this.spyDetails.set(incomingAgentId, storedSpyDetails);

    }

}
