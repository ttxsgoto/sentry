import React from 'react';
import {mount} from 'enzyme';
import {browserHistory} from 'react-router';

import Discover from 'app/views/organizationDiscover/discover';
import createQueryBuilder from 'app/views/organizationDiscover/queryBuilder';

describe('Discover', function() {
  let organization, project, queryBuilder;
  beforeEach(function() {
    project = TestStubs.Project();
    organization = TestStubs.Organization({projects: [project]});
    queryBuilder = createQueryBuilder({}, organization);
  });

  afterEach(function() {
    MockApiClient.clearMockResponses();
  });

  describe('componentDidMount()', function() {
    let wrapper, mockResponse;
    beforeEach(function() {
      mockResponse = {
        timing: {},
        data: [{foo: 'bar', project_id: project.id}],
        meta: [{name: 'foo'}],
      };
      queryBuilder.fetch = jest.fn(() => Promise.resolve(mockResponse));
    });
    it('auto-runs saved query', async function() {
      wrapper = mount(
        <Discover
          queryBuilder={queryBuilder}
          organization={organization}
          params={{}}
          updateSavedQueryData={() => {}}
          savedQuery={TestStubs.DiscoverSavedQuery()}
        />,
        TestStubs.routerContext([{organization}])
      );
      await tick();
      expect(wrapper.state().data.baseQuery.query).toEqual(queryBuilder.getExternal());
      expect(wrapper.state().data.baseQuery.data).toEqual(
        expect.objectContaining({data: mockResponse.data})
      );
    });

    it('does not auto run non-saved query', async function() {
      wrapper = mount(
        <Discover
          queryBuilder={queryBuilder}
          organization={organization}
          params={{}}
          updateSavedQueryData={() => {}}
        />,
        TestStubs.routerContext([{organization}])
      );
      await tick();
      expect(wrapper.state().data.baseQuery.query).toBe(null);
      expect(wrapper.state().data.baseQuery.data).toBe(null);
    });
  });

  describe('componentWillRecieveProps()', function() {
    it('handles navigating to saved query', function() {
      const wrapper = mount(
        <Discover
          queryBuilder={queryBuilder}
          organization={organization}
          params={{}}
          updateSavedQueryData={() => {}}
          location={{search: ''}}
        />,
        TestStubs.routerContext([{organization}])
      );
      expect(wrapper.find('QueryEdit')).toHaveLength(1);
      expect(wrapper.find('QueryRead')).toHaveLength(0);
      wrapper.setProps({
        savedQuery: TestStubs.DiscoverSavedQuery(),
      });
      wrapper.update();
      expect(wrapper.find('QueryEdit')).toHaveLength(0);
      expect(wrapper.find('QueryRead')).toHaveLength(1);
    });
  });

  describe('runQuery()', function() {
    const mockResponse = {timing: {}, data: [], meta: []};
    let wrapper;
    beforeEach(function() {
      queryBuilder.fetch = jest.fn(() => Promise.resolve(mockResponse));

      wrapper = mount(
        <Discover
          queryBuilder={queryBuilder}
          organization={organization}
          params={{}}
          updateSavedQueryData={() => {}}
        />,
        TestStubs.routerContext()
      );
    });

    it('runs basic query', async function() {
      wrapper.instance().runQuery();
      await tick();
      expect(queryBuilder.fetch).toHaveBeenCalledTimes(1);
      expect(queryBuilder.fetch).toHaveBeenCalledWith(queryBuilder.getExternal());
      expect(wrapper.state().data.baseQuery.data).toEqual(mockResponse);
    });

    it('always requests event_id and project_id for basic queries', async function() {
      queryBuilder.updateField('fields', ['message']);
      wrapper.instance().runQuery();
      await tick();
      expect(queryBuilder.fetch).toHaveBeenCalledTimes(1);
      expect(queryBuilder.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: ['message', 'event_id', 'project_id'],
        })
      );
      expect(wrapper.state().data.baseQuery.data).toEqual(mockResponse);
    });

    it('removes incomplete conditions', async function() {
      queryBuilder.updateField('conditions', [[], []]);
      wrapper.instance().runQuery();
      await tick();
      expect(queryBuilder.fetch).toHaveBeenCalledTimes(1);
      expect(queryBuilder.getExternal().conditions).toEqual([]);
    });

    it('removes incomplete aggregations', async function() {
      queryBuilder.updateField('aggregations', [[], []]);
      wrapper.instance().runQuery();
      await tick();
      expect(queryBuilder.fetch).toHaveBeenCalledTimes(1);
      expect(queryBuilder.getExternal().aggregations).toEqual([]);
    });

    it('also runs chart query if there are aggregations', async function() {
      wrapper.instance().updateField('aggregations', [['count()', null, 'count']]);
      wrapper.instance().runQuery();
      await tick();
      expect(queryBuilder.fetch).toHaveBeenCalledTimes(2);
      expect(queryBuilder.fetch).toHaveBeenNthCalledWith(1, queryBuilder.getExternal());
      expect(queryBuilder.fetch).toHaveBeenNthCalledWith(2, {
        ...queryBuilder.getExternal(),
        groupby: ['time'],
        rollup: 60 * 60 * 24,
        orderby: 'time',
      });
    });
  });

  describe('reset()', function() {
    describe('query builder (no saved query)', function() {
      let wrapper;
      beforeEach(function() {
        const mockResponse = {timing: {}, data: [], meta: []};
        browserHistory.push.mockImplementation(function({search}) {
          wrapper.setProps({
            location: {
              search: search || '',
            },
          });
        });

        queryBuilder.fetch = jest.fn(() => Promise.resolve(mockResponse));
        queryBuilder.reset = jest.fn(queryBuilder.reset);

        wrapper = mount(
          <Discover
            queryBuilder={queryBuilder}
            organization={organization}
            location={{location: '?fields=something'}}
            params={{}}
            updateSavedQueryData={() => {}}
          />,
          TestStubs.routerContext()
        );

        wrapper.instance().updateField('fields', ['message']);
        wrapper.instance().updateField('orderby', 'event_id');
        wrapper.instance().updateField('limit', 5);

        wrapper.instance().runQuery();
        wrapper.update();
      });

      it('resets query builder and state', function() {
        wrapper.instance().reset();
        expect(queryBuilder.reset).toHaveBeenCalled();
        const {data: {baseQuery, byDayQuery}} = wrapper.instance().state;
        expect(baseQuery.query).toBeNull();
        expect(baseQuery.data).toBeNull();
        expect(byDayQuery.query).toBeNull();
        expect(byDayQuery.data).toBeNull();
      });

      it('resets "fields"', function() {
        const fields = wrapper.find('SelectControl[name="fields"]');
        expect(fields.text()).toContain('message');
        wrapper.instance().reset();
        expect(fields.text()).toContain('No fields selected');
      });

      it('resets "orderby"', function() {
        expect(wrapper.find('SelectControl[name="orderby"]').text()).toBe('event_id asc');
        wrapper.instance().reset();
        wrapper.update();
        expect(wrapper.find('SelectControl[name="orderby"]').text()).toBe(
          'timestamp desc'
        );
      });

      it('resets "limit"', function() {
        expect(wrapper.find('NumberField[name="limit"]').prop('value')).toBe(5);
        wrapper.instance().reset();
        wrapper.update();
        expect(wrapper.find('NumberField[name="limit"]').prop('value')).toBe(1000);
      });

      it('does not reset if location.search is empty', function() {
        const prevCallCount = queryBuilder.reset.mock.calls.length;
        wrapper.setProps({
          location: {
            search: '?fields=[]',
          },
        });
        expect(queryBuilder.reset.mock.calls).toHaveLength(prevCallCount);
      });
    });
  });

  describe('Saved query', function() {
    let wrapper, deleteMock, updateMock;
    beforeEach(function() {
      wrapper = mount(
        <Discover
          queryBuilder={queryBuilder}
          organization={organization}
          params={{}}
          savedQuery={TestStubs.DiscoverSavedQuery()}
          updateSavedQueryData={() => {}}
          view="saved"
        />,
        TestStubs.routerContext()
      );

      deleteMock = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/discover/saved/1/',
        method: 'DELETE',
      });

      updateMock = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/discover/saved/1/',
        method: 'PUT',
      });
    });

    it('resets saved query', function() {
      wrapper.instance().updateField('fields', ['message']);
      wrapper.instance().runQuery();
      wrapper.update();
      expect(queryBuilder.getInternal().fields).toEqual(['message']);
      wrapper.instance().reset();
      wrapper.update();
      expect(queryBuilder.getInternal().fields).toEqual(['test']);
    });

    it('toggles edit mode', function() {
      expect(wrapper.find('QueryRead')).toHaveLength(1);
      expect(wrapper.find('QueryEdit')).toHaveLength(0);
      wrapper
        .find('SavedQueryTitle')
        .find('a')
        .simulate('click');
      expect(wrapper.find('QueryRead')).toHaveLength(0);
      expect(wrapper.find('QueryEdit')).toHaveLength(1);
    });

    it('delete saved query', function() {
      // Click edit
      wrapper
        .find('SavedQueryTitle')
        .find('Link')
        .simulate('click');

      // Click delete
      wrapper
        .find('SavedQueryAction')
        .at(1)
        .simulate('click');
      expect(deleteMock).toHaveBeenCalled();
    });

    it('update name', function() {
      // Click edit
      wrapper
        .find('SavedQueryTitle')
        .find('Link')
        .simulate('click');

      // Change name
      wrapper
        .find('EditableName')
        .find('input')
        .simulate('change', {target: {value: 'New name'}});
      wrapper.update();

      // Click save
      wrapper
        .find('SavedQueryAction')
        .at(0)
        .simulate('click');

      wrapper.update();
      expect(updateMock).toHaveBeenCalledWith(
        '/organizations/org-slug/discover/saved/1/',
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'New name',
          }),
        })
      );
    });
  });

  describe('Intro', function() {
    let wrapper;

    beforeEach(function() {
      wrapper = mount(
        <Discover
          queryBuilder={queryBuilder}
          organization={organization}
          location={{location: '?fields=something'}}
          params={{}}
          updateSavedQueryData={() => {}}
        />,
        TestStubs.routerContext()
      );
    });
    it('renders example queries', function() {
      const queries = wrapper.find('IntroContainer').find('li');
      expect(queries).toHaveLength(3);
      expect(queries.first().text()).toBe('Last 10 event IDs');
    });

    it('updates query builder when clicked', function() {
      const queries = wrapper.find('IntroContainer').find('li');
      queries
        .first()
        .find('a')
        .simulate('click');

      const query = queryBuilder.getInternal();
      expect(query.fields).toEqual(['event_id']);
      expect(query.limit).toEqual(10);
    });
  });

  describe('toggleSidebar()', function() {
    let wrapper;
    beforeEach(function() {
      browserHistory.push.mockImplementation(function({search}) {
        wrapper.setProps({
          location: {
            search: search || '',
          },
        });
      });

      wrapper = mount(
        <Discover
          queryBuilder={queryBuilder}
          organization={organization}
          location={{location: ''}}
          params={{}}
          updateSavedQueryData={() => {}}
        />,
        TestStubs.routerContext()
      );
    });

    it('toggles sidebar', function() {
      expect(wrapper.find('QueryEdit')).toHaveLength(1);
      expect(wrapper.find('SavedQueries')).toHaveLength(0);
      wrapper
        .find('SidebarTabs')
        .find('a')
        .at(1)
        .simulate('click');
      expect(wrapper.find('QueryEdit')).toHaveLength(0);
      expect(wrapper.find('SavedQueries')).toHaveLength(1);
    });
  });
});
